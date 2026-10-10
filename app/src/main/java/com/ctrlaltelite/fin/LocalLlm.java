package com.ctrlaltelite.fin;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.mediapipe.tasks.genai.llminference.LlmInference;
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession;

import org.json.JSONObject;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Runs a small language model fully on this phone. No network is used.
 * The model file (about 550 MB) is chosen once by the user and copied into app-private storage.
 */
public class LocalLlm {
    static final int PICK_REQUEST = 9022;
    private static final long MIN_MODEL_BYTES = 50L * 1024 * 1024;

    private final Activity activity;
    private final WebView webView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile LlmInference engine;
    private volatile String state = "nomodel"; // nomodel, copying, idle, loading, ready, error
    private volatile String error = "";
    private volatile int progress = 0;

    public LocalLlm(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        if (modelFile().isFile() && modelFile().length() > MIN_MODEL_BYTES) state = "idle";
    }

    private File modelFile() {
        return new File(new File(activity.getFilesDir(), "llm"), "model.task");
    }

    @JavascriptInterface
    public String status() {
        try {
            JSONObject o = new JSONObject();
            o.put("state", state);
            o.put("error", error);
            o.put("progress", progress);
            o.put("modelMb", modelFile().isFile() ? modelFile().length() / (1024 * 1024) : 0);
            return o.toString();
        } catch (Exception e) {
            return "{\"state\":\"error\",\"error\":\"status failed\"}";
        }
    }

    @JavascriptInterface
    public void pickModel() {
        if ("copying".equals(state) || "loading".equals(state)) return;
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            try {
                activity.startActivityForResult(intent, PICK_REQUEST);
            } catch (Exception ex) {
                fail("Could not open the file picker");
            }
        });
    }

    /** Returns true when the result belonged to this class. */
    public boolean handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_REQUEST) return false;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            emit();
            return true;
        }
        final Uri uri = data.getData();
        state = "copying";
        error = "";
        progress = 0;
        emit();
        executor.execute(() -> copyModel(uri));
        return true;
    }

    private void copyModel(Uri uri) {
        File dir = new File(activity.getFilesDir(), "llm");
        File tmp = new File(dir, "model.tmp");
        try {
            String name = displayName(uri);
            if (name != null && !name.toLowerCase().endsWith(".task")) {
                fail("Choose the file that ends with .task");
                return;
            }
            if (!dir.isDirectory() && !dir.mkdirs()) {
                fail("Could not create the model folder");
                return;
            }
            long total = size(uri);
            closeEngine();
            long done = 0;
            int lastPercent = -1;
            try (InputStream in = activity.getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(tmp)) {
                if (in == null) {
                    fail("Could not read the chosen file");
                    return;
                }
                byte[] buffer = new byte[1024 * 1024];
                int n;
                while ((n = in.read(buffer)) > 0) {
                    out.write(buffer, 0, n);
                    done += n;
                    if (total > 0) {
                        int percent = (int) (done * 100 / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            progress = percent;
                            emit();
                        }
                    }
                }
            }
            if (tmp.length() < MIN_MODEL_BYTES) {
                tmp.delete();
                fail("That file is too small to be the AI model");
                return;
            }
            File target = modelFile();
            if (target.exists() && !target.delete()) {
                fail("Could not replace the old model");
                return;
            }
            if (!tmp.renameTo(target)) {
                fail("Could not save the model");
                return;
            }
            state = "idle";
            progress = 100;
            emit();
            loadNow();
        } catch (Throwable t) {
            tmp.delete();
            fail("Copy failed: " + safeMessage(t));
        }
    }

    @JavascriptInterface
    public void load() {
        if (!"idle".equals(state) && !"error".equals(state)) return;
        if (!modelFile().isFile()) return;
        executor.execute(this::loadNow);
    }

    private void loadNow() {
        if (engine != null) {
            state = "ready";
            emit();
            return;
        }
        state = "loading";
        error = "";
        emit();
        try {
            LlmInference.LlmInferenceOptions options = LlmInference.LlmInferenceOptions.builder()
                    .setModelPath(modelFile().getAbsolutePath())
                    .setMaxTokens(1024)
                    .setMaxTopK(40)
                    .build();
            engine = LlmInference.createFromOptions(activity.getApplicationContext(), options);
            state = "ready";
            emit();
        } catch (Throwable t) {
            engine = null;
            fail("The AI model could not start: " + safeMessage(t));
        }
    }

    /** Runs one question. The answer comes back through window.onLlmResult(id, text, errorText). */
    @JavascriptInterface
    public void generate(final String id, final String system, final String user) {
        executor.execute(() -> {
            LlmInference current = engine;
            if (current == null) {
                result(id, "", "The AI model is not ready");
                return;
            }
            LlmInferenceSession session = null;
            try {
                LlmInferenceSession.LlmInferenceSessionOptions sessionOptions =
                        LlmInferenceSession.LlmInferenceSessionOptions.builder()
                                .setTopK(1)
                                .setTemperature(0.1f)
                                .build();
                session = LlmInferenceSession.createFromOptions(current, sessionOptions);
                String prompt = "<|im_start|>system\n" + system + "<|im_end|>\n"
                        + "<|im_start|>user\n" + user + "<|im_end|>\n"
                        + "<|im_start|>assistant\n";
                session.addQueryChunk(prompt);
                String text = session.generateResponse();
                result(id, text == null ? "" : text, "");
            } catch (Throwable t) {
                result(id, "", safeMessage(t));
            } finally {
                if (session != null) {
                    try {
                        session.close();
                    } catch (Throwable ignored) {
                    }
                }
            }
        });
    }

    @JavascriptInterface
    public void removeModel() {
        executor.execute(() -> {
            closeEngine();
            File f = modelFile();
            if (f.exists()) f.delete();
            state = "nomodel";
            error = "";
            progress = 0;
            emit();
        });
    }

    private void closeEngine() {
        LlmInference current = engine;
        engine = null;
        if (current != null) {
            try {
                current.close();
            } catch (Throwable ignored) {
            }
        }
    }

    public void close() {
        executor.shutdownNow();
        closeEngine();
    }

    private void fail(String message) {
        error = message;
        state = "error";
        emit();
    }

    private void emit() {
        final String json = status();
        activity.runOnUiThread(() -> webView.evaluateJavascript(
                "if(typeof window.onLlmEvent==='function')window.onLlmEvent(" + JSONObject.quote(json) + ")", null));
    }

    private void result(String id, String text, String err) {
        final String script = "if(typeof window.onLlmResult==='function')window.onLlmResult("
                + JSONObject.quote(id) + "," + JSONObject.quote(text) + "," + JSONObject.quote(err) + ")";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private String displayName(Uri uri) {
        try (Cursor c = activity.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        }
        return null;
    }

    private long size(Uri uri) {
        try (Cursor c = activity.getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception ignored) {
        }
        return -1;
    }

    private static String safeMessage(Throwable t) {
        String m = t.getMessage();
        if (m == null || m.trim().isEmpty()) m = t.getClass().getSimpleName();
        return m.length() > 160 ? m.substring(0, 160) : m;
    }
}
