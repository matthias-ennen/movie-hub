package de.matthiasennen.moviehub;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/** Device-local durable checkpoint/outbox. Never stores network URLs or credentials. */
final class SmbProgressStore {
    static final long MAX_DURATION_MS = 604_800_000L;
    static final long MIN_RESUME_MS = 10_000L;
    static final long END_MARGIN_MS = 15_000L;
    private static final Pattern SCOPE = Pattern.compile("[A-Za-z0-9_-]{1,128}");
    private static final Pattern ID = Pattern.compile("[a-f0-9]{64}");
    private static final Object LOCK = new Object();
    private final SharedPreferences prefs;

    SmbProgressStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences("smb-progress-v1", Context.MODE_PRIVATE);
    }

    static boolean validScope(String value) { return value != null && SCOPE.matcher(value).matches(); }
    static boolean validId(String value) { return value != null && ID.matcher(value).matches(); }

    static String mediaId(String titleKey, String entryId, String canonicalUrl) {
        if (!validScope(titleKey) || !validScope(entryId) || canonicalUrl == null) return "";
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(
                    (titleKey + "\n" + entryId + "\n" + canonicalUrl).getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte b : bytes) result.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            return result.toString();
        } catch (Exception ignored) { return ""; }
    }

    static long resumablePosition(long position, long duration) {
        return duration > 0 && duration <= MAX_DURATION_MS && position >= MIN_RESUME_MS
                && position < duration - END_MARGIN_MS ? position : 0;
    }

    static final class Record {
        final long position, duration, updatedAt;
        final boolean pending;
        Record(long position, long duration, long updatedAt, boolean pending) {
            this.position = position; this.duration = duration; this.updatedAt = updatedAt; this.pending = pending;
        }
        static Record parse(String raw) {
            try {
                JSONObject json = new JSONObject(raw);
                long p = json.getLong("positionMs"), d = json.getLong("durationMs"), t = json.getLong("updatedAtMs");
                if (p < 0 || d <= 0 || d > MAX_DURATION_MS || p > d || t <= 0 || t > 9_007_199_254_740_991L) return null;
                return new Record(resumablePosition(p, d), d, t, json.optBoolean("pending", false));
            } catch (Exception ignored) { return null; }
        }
        JSONObject json() {
            JSONObject result = new JSONObject();
            try {
                result.put("positionMs", position).put("durationMs", duration).put("updatedAtMs", updatedAt)
                        .put("pending", pending);
            } catch (Exception ignored) {}
            return result;
        }
    }

    private static String prefix(String user, String profile) {
        return validScope(user) && validScope(profile) ? user + ":" + profile + ":" : null;
    }
    private static String key(String user, String profile, String id) {
        String prefix = prefix(user, profile);
        return prefix != null && validId(id) ? prefix + id : null;
    }
    private Record read(String key) { return Record.parse(prefs.getString(key, "")); }
    private void write(String key, Record record) { prefs.edit().putString(key, record.json().toString()).apply(); }

    Record resolve(String user, String profile, String id, String remoteJson) {
        String key = key(user, profile, id);
        if (key == null) return null;
        synchronized (LOCK) {
            Record local = read(key), remote = Record.parse(remoteJson);
            if (remote != null && (local == null || remote.updatedAt >= local.updatedAt)) {
                Record clean = new Record(remote.position, remote.duration, remote.updatedAt, false);
                write(key, clean);
                return clean;
            }
            return local;
        }
    }

    void save(String user, String profile, String id, long position, long duration) {
        String key = key(user, profile, id);
        if (key == null || duration <= 0 || duration > MAX_DURATION_MS) return;
        synchronized (LOCK) {
            Record previous = read(key);
            long normalized = resumablePosition(position, duration);
            if (previous != null && previous.position == normalized && previous.duration == duration) return;
            long updatedAt = Math.max(System.currentTimeMillis(), previous == null ? 1 : previous.updatedAt + 1);
            write(key, new Record(normalized, duration, updatedAt, true));
        }
    }

    String pending(String user, String profile) {
        String prefix = prefix(user, profile);
        JSONArray result = new JSONArray();
        if (prefix == null) return result.toString();
        synchronized (LOCK) {
            for (Map.Entry<String, ?> item : prefs.getAll().entrySet()) {
                if (!item.getKey().startsWith(prefix) || !(item.getValue() instanceof String)) continue;
                String id = item.getKey().substring(prefix.length());
                Record record = Record.parse((String) item.getValue());
                if (!validId(id) || record == null || !record.pending) continue;
                try { result.put(record.json().put("id", id)); } catch (Exception ignored) {}
                if (result.length() >= 100) break;
            }
        }
        return result.toString();
    }

    void acknowledge(String user, String profile, String id, long updatedAt, String acceptedJson) {
        String key = key(user, profile, id);
        if (key == null) return;
        synchronized (LOCK) {
            Record current = read(key);
            if (current != null && current.updatedAt == updatedAt && current.pending) {
                Record accepted = Record.parse(acceptedJson);
                Record winner = accepted != null && accepted.updatedAt >= current.updatedAt ? accepted : current;
                write(key, new Record(winner.position, winner.duration, winner.updatedAt, false));
            }
        }
    }
}
