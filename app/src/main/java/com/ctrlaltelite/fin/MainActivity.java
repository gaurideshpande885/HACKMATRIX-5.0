package com.ctrlaltelite.fin;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private FinDatabaseBridge databaseBridge;
    private final ExecutorService pdfExecutor = Executors.newSingleThreadExecutor();
    private Uri pendingPdfUri;
    private static final int FILE_REQUEST = 9021;
    private static final String APP_URL = "file:///android_asset/index.html?release=" + BuildConfig.VERSION_NAME;

    @Override
    @SuppressLint("SetJavaScriptEnabled") // Required by the bundled local UI; navigation is restricted to app assets.
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND, true);
        }
        setContentView(webView);
        PDFBoxResourceLoader.init(getApplicationContext());

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSaveFormData(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " FINCopilot/" + BuildConfig.VERSION_NAME);

        databaseBridge = new FinDatabaseBridge(this);
        webView.addJavascriptInterface(databaseBridge, "FinNative");
        webView.addJavascriptInterface(this, "FinPdf");
        webView.removeJavascriptInterface("searchBoxJavaBridge_");
        webView.removeJavascriptInterface("accessibility");
        webView.removeJavascriptInterface("accessibilityTraversal");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !("file".equals(uri.getScheme()) && uri.toString().startsWith("file:///android_asset/"));
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return url == null || !url.startsWith("file:///android_asset/");
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                        "text/csv", "text/comma-separated-values", "application/csv", "text/plain", "application/pdf"
                });
                try {
                    startActivityForResult(intent, FILE_REQUEST);
                } catch (Exception ex) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        webView.loadUrl(APP_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                if (PdfStatementExtractor.isPdf(getContentResolver(), uri)) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    pendingPdfUri = uri;
                    extractPdfAsync(uri, "");
                    return;
                }
                fileCallback.onReceiveValue(new Uri[]{uri});
                fileCallback = null;
                return;
            }
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
    }

    @JavascriptInterface
    public void retryPdf(String password) {
        Uri uri = pendingPdfUri;
        if (uri == null) {
            sendPdfError("Select the PDF statement again");
            return;
        }
        String boundedPassword = password == null ? "" : password;
        if (boundedPassword.length() > 128) {
            sendPdfError("The PDF password is too long");
            return;
        }
        extractPdfAsync(uri, boundedPassword);
    }

    private void extractPdfAsync(Uri uri, String password) {
        String name = PdfStatementExtractor.displayName(getContentResolver(), uri);
        evaluatePdfCallback("handleNativePdfStarted", JSONObject.quote(name));
        pdfExecutor.execute(() -> {
            try {
                PdfStatementExtractor.Result result = PdfStatementExtractor.extract(getContentResolver(), uri, password);
                JSONObject payload = new JSONObject();
                payload.put("fileName", result.fileName);
                payload.put("text", result.text);
                if (!result.alternateText.isEmpty()) payload.put("alternateText", result.alternateText);
                payload.put("pages", result.pages);
                payload.put("fileBytes", result.fileBytes);
                pendingPdfUri = null;
                evaluatePdfCallback("handleNativePdfText", payload.toString());
            } catch (InvalidPasswordException exception) {
                evaluatePdfCallback("handleNativePdfPasswordRequired", JSONObject.quote(name));
            } catch (Exception exception) {
                pendingPdfUri = null;
                String message = exception.getMessage();
                sendPdfError(message == null || message.trim().isEmpty() ? "The PDF statement could not be read" : message);
            }
        });
    }

    private void sendPdfError(String message) {
        evaluatePdfCallback("handleNativePdfError", JSONObject.quote(message));
    }

    private void evaluatePdfCallback(String function, String argument) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("if(typeof window." + function + "==='function')window." + function + "(" + argument + ")", null);
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("FinNative");
            webView.removeJavascriptInterface("FinPdf");
            webView.destroy();
        }
        pdfExecutor.shutdownNow();
        if (databaseBridge != null) databaseBridge.close();
        super.onDestroy();
    }
}
