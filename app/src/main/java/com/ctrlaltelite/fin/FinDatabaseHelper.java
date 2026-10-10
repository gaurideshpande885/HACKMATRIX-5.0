package com.ctrlaltelite.fin;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

final class FinDatabaseHelper extends SQLiteOpenHelper {
    static final String DATABASE_NAME = "fin_health.db";
    static final int DATABASE_VERSION = 3;
    private static final int MAX_ANALYSIS_RUNS = 100;
    private static final int MAX_FEEDBACK_EVENTS = 2000;
    private static final int MAX_TRANSACTIONS = 10000;
    private static final Set<String> TYPES = new HashSet<>();
    private static final Set<String> FEEDBACK_TYPES = new HashSet<>();

    static {
        TYPES.add("income");
        TYPES.add("expense");
        FEEDBACK_TYPES.add("displayed");
        FEEDBACK_TYPES.add("accepted");
        FEEDBACK_TYPES.add("completed");
        FEEDBACK_TYPES.add("dismissed");
        FEEDBACK_TYPES.add("saved");
    }

    FinDatabaseHelper(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.setForeignKeyConstraintsEnabled(true);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE transactions (" +
                "id TEXT PRIMARY KEY NOT NULL," +
                "posted_at TEXT NOT NULL," +
                "description TEXT NOT NULL," +
                "amount REAL NOT NULL," +
                "category TEXT NOT NULL," +
                "type TEXT NOT NULL CHECK(type IN ('income','expense'))," +
                "source TEXT NOT NULL DEFAULT 'manual'," +
                "created_at INTEGER NOT NULL," +
                "updated_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX idx_transactions_posted_at ON transactions(posted_at DESC)");
        db.execSQL("CREATE INDEX idx_transactions_category ON transactions(category)");
        db.execSQL("CREATE TABLE financial_profile (" +
                "id INTEGER PRIMARY KEY CHECK(id = 1)," +
                "cash_balance REAL NOT NULL DEFAULT 0," +
                "liquid_savings REAL NOT NULL DEFAULT 0," +
                "investments REAL NOT NULL DEFAULT 0," +
                "total_debt REAL NOT NULL DEFAULT 0," +
                "emergency_fund REAL NOT NULL DEFAULT 0," +
                "credit_score INTEGER NOT NULL DEFAULT 0," +
                "credit_used REAL NOT NULL DEFAULT 0," +
                "credit_limit REAL NOT NULL DEFAULT 0," +
                "updated_label TEXT NOT NULL," +
                "updated_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE financial_history (" +
                "period TEXT PRIMARY KEY NOT NULL," +
                "label TEXT NOT NULL," +
                "assets REAL NOT NULL," +
                "debt REAL NOT NULL," +
                "created_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE analysis_runs (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "input_hash TEXT NOT NULL," +
                "created_at INTEGER NOT NULL," +
                "record_count INTEGER NOT NULL," +
                "health_score INTEGER NOT NULL," +
                "net_worth REAL NOT NULL," +
                "debt_pressure REAL NOT NULL," +
                "cash_gap_probability REAL NOT NULL," +
                "confidence REAL NOT NULL," +
                "validation_status TEXT NOT NULL DEFAULT 'unavailable'," +
                "backtest_count INTEGER NOT NULL DEFAULT 0," +
                "day30_mae REAL," +
                "interval_coverage REAL," +
                "brier_score REAL," +
                "calibration_status TEXT NOT NULL DEFAULT 'unavailable'," +
                "result_json TEXT NOT NULL)");
        db.execSQL("CREATE INDEX idx_analysis_created_at ON analysis_runs(created_at DESC)");
        createLearningTables(db);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) createLearningTables(db);
        if (oldVersion < 3) {
            db.execSQL("ALTER TABLE analysis_runs ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'unavailable'");
            db.execSQL("ALTER TABLE analysis_runs ADD COLUMN backtest_count INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE analysis_runs ADD COLUMN day30_mae REAL");
            db.execSQL("ALTER TABLE analysis_runs ADD COLUMN interval_coverage REAL");
            db.execSQL("ALTER TABLE analysis_runs ADD COLUMN brier_score REAL");
            db.execSQL("ALTER TABLE analysis_runs ADD COLUMN calibration_status TEXT NOT NULL DEFAULT 'unavailable'");
        }
    }

    private void createLearningTables(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS feedback_events (" +
                "event_id TEXT PRIMARY KEY NOT NULL," +
                "decision_id TEXT NOT NULL," +
                "action_id TEXT NOT NULL," +
                "event_type TEXT NOT NULL CHECK(event_type IN ('displayed','accepted','completed','dismissed','saved'))," +
                "reward REAL NOT NULL," +
                "propensity REAL NOT NULL CHECK(propensity > 0 AND propensity <= 1)," +
                "context_json TEXT NOT NULL," +
                "details_json TEXT NOT NULL," +
                "policy_version TEXT NOT NULL," +
                "created_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback_events(created_at DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_feedback_action ON feedback_events(action_id, event_type)");
        db.execSQL("CREATE TABLE IF NOT EXISTS policy_state (" +
                "id INTEGER PRIMARY KEY CHECK(id = 1)," +
                "version TEXT NOT NULL," +
                "interaction_count INTEGER NOT NULL," +
                "state_json TEXT NOT NULL," +
                "updated_at INTEGER NOT NULL)");
    }

    synchronized JSONObject loadBootstrap() throws JSONException {
        SQLiteDatabase db = getReadableDatabase();
        JSONObject root = new JSONObject();
        root.put("transactions", readTransactions(db));
        root.put("financialHistory", readFinancialProfile(db));
        root.put("learning", readLearningState(db));
        root.put("database", readStatus(db));
        return root;
    }

    synchronized JSONObject saveLearningUpdate(JSONObject event, JSONObject policy) throws JSONException {
        String eventId = clean(event.optString("eventId", ""), 80);
        String decisionId = clean(event.optString("decisionId", ""), 80);
        String actionId = clean(event.optString("actionId", ""), 40);
        String eventType = clean(event.optString("eventType", ""), 20).toLowerCase(Locale.US);
        String policyVersion = clean(event.optString("policyVersion", "linucb-1.0"), 40);
        double reward = event.optDouble("reward", Double.NaN);
        double propensity = event.optDouble("propensity", Double.NaN);
        if (eventId.isEmpty() || decisionId.isEmpty() || actionId.isEmpty()) {
            throw new JSONException("Learning event identifiers are required");
        }
        if (!FEEDBACK_TYPES.contains(eventType)) throw new JSONException("Unsupported learning event type");
        if (!Double.isFinite(reward) || reward < -2 || reward > 2) throw new JSONException("Reward must be between -2 and 2");
        if (!Double.isFinite(propensity) || propensity <= 0 || propensity > 1) throw new JSONException("Propensity must be in (0, 1]");

        String contextJson = event.optJSONObject("context") == null ? "{}" : event.optJSONObject("context").toString();
        String detailsJson = event.optJSONObject("details") == null ? "{}" : event.optJSONObject("details").toString();
        String stateJson = policy.toString();
        if (contextJson.length() > 12000 || detailsJson.length() > 6000 || stateJson.length() > 100000) {
            throw new JSONException("Learning payload exceeds local limits");
        }
        String version = clean(policy.optString("version", "linucb-1.0"), 40);
        int interactions = policy.optInt("interactions", 0);
        if (interactions < 0 || policy.optJSONObject("arms") == null) throw new JSONException("Invalid policy state");

        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        db.beginTransaction();
        try {
            ContentValues feedback = new ContentValues();
            feedback.put("event_id", eventId);
            feedback.put("decision_id", decisionId);
            feedback.put("action_id", actionId);
            feedback.put("event_type", eventType);
            feedback.put("reward", reward);
            feedback.put("propensity", propensity);
            feedback.put("context_json", contextJson);
            feedback.put("details_json", detailsJson);
            feedback.put("policy_version", policyVersion);
            feedback.put("created_at", now);
            db.insertWithOnConflict("feedback_events", null, feedback, SQLiteDatabase.CONFLICT_IGNORE);

            ContentValues state = new ContentValues();
            state.put("id", 1);
            state.put("version", version);
            state.put("interaction_count", interactions);
            state.put("state_json", stateJson);
            state.put("updated_at", now);
            db.insertWithOnConflict("policy_state", null, state, SQLiteDatabase.CONFLICT_REPLACE);
            db.execSQL("DELETE FROM feedback_events WHERE event_id NOT IN (SELECT event_id FROM feedback_events ORDER BY created_at DESC LIMIT " + MAX_FEEDBACK_EVENTS + ")");
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return readLearningState(db);
    }

    synchronized JSONObject replaceTransactions(JSONArray rows, String source) throws JSONException {
        if (rows.length() > MAX_TRANSACTIONS) {
            throw new JSONException("Import exceeds the 10,000 transaction limit");
        }
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        Set<String> ids = new HashSet<>();
        db.beginTransaction();
        try {
            db.delete("transactions", null, null);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = validateTransaction(rows.getJSONObject(i));
                String id = row.getString("id");
                if (!ids.add(id)) throw new JSONException("Duplicate transaction id: " + id);
                ContentValues values = transactionValues(row, source, now);
                if (db.insertOrThrow("transactions", null, values) < 0) {
                    throw new IllegalStateException("Transaction insert failed");
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return readStatus(db);
    }

    synchronized JSONObject upsertTransaction(JSONObject raw, String source) throws JSONException {
        SQLiteDatabase db = getWritableDatabase();
        JSONObject row = validateTransaction(raw);
        long now = System.currentTimeMillis();
        ContentValues values = transactionValues(row, source, now);
        values.put("created_at", now);
        db.insertWithOnConflict("transactions", null, values, SQLiteDatabase.CONFLICT_REPLACE);
        return readStatus(db);
    }

    synchronized JSONObject updateCategory(String id, String category) throws JSONException {
        if (id == null || id.trim().isEmpty() || category == null || category.trim().isEmpty()) {
            throw new JSONException("Transaction id and category are required");
        }
        ContentValues values = new ContentValues();
        values.put("category", category.trim());
        values.put("updated_at", System.currentTimeMillis());
        int changed = getWritableDatabase().update("transactions", values, "id = ?", new String[]{id});
        if (changed != 1) throw new JSONException("Transaction was not found");
        return readStatus(getReadableDatabase());
    }

    synchronized JSONObject saveFinancialProfile(JSONObject profile) throws JSONException {
        validateNonNegative(profile, "cashBalance", "liquidSavings", "investments", "totalDebt",
                "emergencyFund", "creditUsed", "creditLimit");
        int creditScore = profile.optInt("creditScore", 0);
        if (creditScore < 300 || creditScore > 900) throw new JSONException("Credit score must be 300-900");
        if (profile.optDouble("creditUsed", 0) > profile.optDouble("creditLimit", 0)) {
            throw new JSONException("Credit used cannot exceed the credit limit");
        }
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        db.beginTransaction();
        try {
            ContentValues values = new ContentValues();
            values.put("id", 1);
            values.put("cash_balance", profile.optDouble("cashBalance", 0));
            values.put("liquid_savings", profile.optDouble("liquidSavings", 0));
            values.put("investments", profile.optDouble("investments", 0));
            values.put("total_debt", profile.optDouble("totalDebt", 0));
            values.put("emergency_fund", profile.optDouble("emergencyFund", 0));
            values.put("credit_score", creditScore);
            values.put("credit_used", profile.optDouble("creditUsed", 0));
            values.put("credit_limit", profile.optDouble("creditLimit", 0));
            values.put("updated_label", clean(profile.optString("updatedAt", "Saved profile"), 80));
            values.put("updated_at", now);
            db.insertWithOnConflict("financial_profile", null, values, SQLiteDatabase.CONFLICT_REPLACE);

            JSONArray history = profile.optJSONArray("history");
            if (history != null) {
                db.delete("financial_history", null, null);
                for (int i = 0; i < history.length(); i++) {
                    JSONObject point = history.getJSONObject(i);
                    String label = clean(point.optString("month", ""), 24);
                    String period = clean(point.optString("period", ""), 24);
                    if (period.trim().isEmpty()) period = "legacy-" + i + "-" + label;
                    double assets = point.optDouble("assets", -1);
                    double debt = point.optDouble("debt", -1);
                    if (label.trim().isEmpty() || assets < 0 || debt < 0) {
                        throw new JSONException("Invalid financial-history point at index " + i);
                    }
                    ContentValues historyValues = new ContentValues();
                    historyValues.put("period", period);
                    historyValues.put("label", label);
                    historyValues.put("assets", assets);
                    historyValues.put("debt", debt);
                    historyValues.put("created_at", now + i);
                    db.insertOrThrow("financial_history", null, historyValues);
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return readStatus(db);
    }

    synchronized JSONObject saveAnalysis(JSONObject analysis) throws JSONException {
        String canonical = analysis.toString();
        String inputHash = sha256(analysis.optString("inputFingerprint", canonical));
        SQLiteDatabase db = getWritableDatabase();
        try (Cursor cursor = db.rawQuery("SELECT input_hash FROM analysis_runs ORDER BY id DESC LIMIT 1", null)) {
            if (cursor.moveToFirst() && inputHash.equals(cursor.getString(0))) return readStatus(db);
        }
        ContentValues values = new ContentValues();
        values.put("input_hash", inputHash);
        values.put("created_at", System.currentTimeMillis());
        values.put("record_count", analysis.optInt("recordCount", 0));
        values.put("health_score", analysis.optInt("healthScore", 0));
        values.put("net_worth", analysis.optDouble("netWorth", 0));
        values.put("debt_pressure", analysis.optDouble("debtPressure", 0));
        values.put("cash_gap_probability", analysis.isNull("cashGapProbability") ? -1 : analysis.optDouble("cashGapProbability", -1));
        values.put("confidence", analysis.optDouble("confidence", 0));
        JSONObject validation = analysis.optJSONObject("validation");
        JSONObject accuracy = validation == null ? null : validation.optJSONObject("accuracy");
        JSONObject horizons = accuracy == null ? null : accuracy.optJSONObject("horizons");
        JSONObject day30 = horizons == null ? null : horizons.optJSONObject("30");
        values.put("validation_status", clean(validation == null ? "unavailable" : validation.optString("status", "unavailable"), 32));
        values.put("backtest_count", validation == null ? 0 : validation.optInt("completedBacktests", 0));
        putFiniteOrNull(values, "day30_mae", day30, "p50Mae");
        putFiniteOrNull(values, "interval_coverage", day30, "intervalCoverage");
        putFiniteOrNull(values, "brier_score", accuracy, "brierScore");
        values.put("calibration_status", clean(validation == null ? "unavailable" : validation.optString("calibrationStatus", "unavailable"), 32));
        values.put("result_json", canonical);
        db.insertOrThrow("analysis_runs", null, values);
        db.execSQL("DELETE FROM analysis_runs WHERE id NOT IN (SELECT id FROM analysis_runs ORDER BY id DESC LIMIT " + MAX_ANALYSIS_RUNS + ")");
        return readStatus(db);
    }

    private void putFiniteOrNull(ContentValues values, String column, JSONObject source, String key) {
        if (source == null || source.isNull(key)) {
            values.putNull(column);
            return;
        }
        double value = source.optDouble(key, Double.NaN);
        if (Double.isFinite(value)) values.put(column, value);
        else values.putNull(column);
    }

    private JSONArray readTransactions(SQLiteDatabase db) throws JSONException {
        JSONArray rows = new JSONArray();
        try (Cursor cursor = db.query("transactions",
                new String[]{"id", "posted_at", "description", "amount", "category", "type"},
                null, null, null, null, "posted_at DESC, id DESC")) {
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", cursor.getString(0));
                row.put("date", cursor.getString(1));
                row.put("description", cursor.getString(2));
                row.put("amount", cursor.getDouble(3));
                row.put("category", cursor.getString(4));
                row.put("type", cursor.getString(5));
                rows.put(row);
            }
        }
        return rows;
    }

    private JSONObject readFinancialProfile(SQLiteDatabase db) throws JSONException {
        JSONObject profile = new JSONObject();
        try (Cursor cursor = db.query("financial_profile",
                new String[]{"cash_balance", "liquid_savings", "investments", "total_debt", "emergency_fund",
                        "credit_score", "credit_used", "credit_limit", "updated_label"},
                "id = 1", null, null, null, null)) {
            if (cursor.moveToFirst()) {
                profile.put("cashBalance", cursor.getDouble(0));
                profile.put("liquidSavings", cursor.getDouble(1));
                profile.put("investments", cursor.getDouble(2));
                profile.put("totalDebt", cursor.getDouble(3));
                profile.put("emergencyFund", cursor.getDouble(4));
                profile.put("creditScore", cursor.getInt(5));
                profile.put("creditUsed", cursor.getDouble(6));
                profile.put("creditLimit", cursor.getDouble(7));
                profile.put("updatedAt", cursor.getString(8));
            }
        }
        JSONArray history = new JSONArray();
        try (Cursor cursor = db.query("financial_history", new String[]{"period", "label", "assets", "debt"},
                null, null, null, null, "created_at ASC")) {
            while (cursor.moveToNext()) {
                JSONObject point = new JSONObject();
                point.put("period", cursor.getString(0));
                point.put("month", cursor.getString(1));
                point.put("assets", cursor.getDouble(2));
                point.put("debt", cursor.getDouble(3));
                history.put(point);
            }
        }
        profile.put("history", history);
        return profile;
    }

    private JSONObject readLearningState(SQLiteDatabase db) throws JSONException {
        JSONObject learning = new JSONObject();
        learning.put("feedbackCount", scalarLong(db, "SELECT COUNT(*) FROM feedback_events"));
        learning.put("lastFeedbackAt", scalarLong(db, "SELECT COALESCE(MAX(created_at), 0) FROM feedback_events"));
        try (Cursor cursor = db.rawQuery("SELECT COALESCE(AVG(reward), 0) FROM feedback_events WHERE event_type != 'displayed'", null)) {
            learning.put("averageReward", cursor.moveToFirst() ? cursor.getDouble(0) : 0);
        }
        try (Cursor cursor = db.query("policy_state", new String[]{"state_json"}, "id = 1", null, null, null, null)) {
            if (cursor.moveToFirst()) learning.put("policyState", new JSONObject(cursor.getString(0)));
        }
        return learning;
    }

    private JSONObject readStatus(SQLiteDatabase db) throws JSONException {
        JSONObject status = new JSONObject();
        status.put("engine", "SQLite");
        status.put("schemaVersion", DATABASE_VERSION);
        status.put("transactionCount", scalarLong(db, "SELECT COUNT(*) FROM transactions"));
        status.put("snapshotCount", scalarLong(db, "SELECT COUNT(*) FROM financial_history"));
        status.put("analysisRuns", scalarLong(db, "SELECT COUNT(*) FROM analysis_runs"));
        status.put("feedbackEvents", scalarLong(db, "SELECT COUNT(*) FROM feedback_events"));
        status.put("lastAnalysisAt", scalarLong(db, "SELECT COALESCE(MAX(created_at), 0) FROM analysis_runs"));
        return status;
    }

    private long scalarLong(SQLiteDatabase db, String sql) {
        try (Cursor cursor = db.rawQuery(sql, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0;
        }
    }

    private JSONObject validateTransaction(JSONObject raw) throws JSONException {
        String id = clean(raw.optString("id", ""), 80);
        String date = clean(raw.optString("date", ""), 10);
        String description = clean(raw.optString("description", ""), 180);
        String category = clean(raw.optString("category", "Other"), 60);
        double amount = raw.optDouble("amount", 0);
        String type = raw.optString("type", amount >= 0 ? "income" : "expense").toLowerCase(Locale.US);
        if (id.trim().isEmpty() || description.trim().isEmpty()) throw new JSONException("Transaction id and description are required");
        if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) throw new JSONException("Transaction date must use YYYY-MM-DD");
        if (Double.isNaN(amount) || Double.isInfinite(amount) || amount == 0) throw new JSONException("Transaction amount must be non-zero");
        if (!TYPES.contains(type)) throw new JSONException("Transaction type must be income or expense");
        if ((amount > 0 && !"income".equals(type)) || (amount < 0 && !"expense".equals(type))) {
            type = amount > 0 ? "income" : "expense";
        }
        JSONObject row = new JSONObject();
        row.put("id", id);
        row.put("date", date);
        row.put("description", description);
        row.put("amount", amount);
        row.put("category", category);
        row.put("type", type);
        return row;
    }

    private ContentValues transactionValues(JSONObject row, String source, long now) throws JSONException {
        ContentValues values = new ContentValues();
        values.put("id", row.getString("id"));
        values.put("posted_at", row.getString("date"));
        values.put("description", row.getString("description"));
        values.put("amount", row.getDouble("amount"));
        values.put("category", row.getString("category"));
        values.put("type", row.getString("type"));
        values.put("source", clean(source == null ? "unknown" : source, 40));
        values.put("created_at", now);
        values.put("updated_at", now);
        return values;
    }

    private void validateNonNegative(JSONObject object, String... keys) throws JSONException {
        for (String key : keys) {
            double value = object.optDouble(key, 0);
            if (Double.isNaN(value) || Double.isInfinite(value) || value < 0) throw new JSONException(key + " must be non-negative");
        }
    }

    private String clean(String value, int maxLength) {
        String cleaned = value == null ? "" : value.trim();
        return cleaned.length() <= maxLength ? cleaned : cleaned.substring(0, maxLength);
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder();
            for (byte b : digest) {
                int byteValue = b & 0xff;
                if (byteValue < 16) builder.append('0');
                builder.append(Integer.toHexString(byteValue));
            }
            return builder.toString();
        } catch (Exception ignored) {
            return Integer.toHexString(value.hashCode());
        }
    }
}
