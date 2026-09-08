package de.matthiasennen.moviehub;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Stores credential-free drive definitions locally on this Android device. */
final class NetworkDriveStore {
    private static final String PREFERENCES = "movie_hub_network_drives";
    private static final String DRIVE_LIST = "drive_list_v1";
    private final SharedPreferences preferences;

    NetworkDriveStore(Context context) {
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    synchronized List<NetworkDrive> loadAll() {
        List<NetworkDrive> drives = new ArrayList<>();
        String raw = preferences.getString(DRIVE_LIST, "[]");
        try {
            JSONArray array = new JSONArray(raw);
            for (int index = 0; index < array.length(); index++) {
                try {
                    drives.add(NetworkDrive.fromJson(array.getJSONObject(index)));
                } catch (Exception ignored) {
                    // Preserve all valid entries if one old definition is damaged.
                }
            }
        } catch (Exception ignored) { }
        return drives;
    }

    synchronized boolean save(NetworkDrive drive) {
        List<NetworkDrive> drives = loadAll();
        boolean replaced = false;
        for (int index = 0; index < drives.size(); index++) {
            if (drives.get(index).getId().equals(drive.getId())) {
                drives.set(index, drive);
                replaced = true;
                break;
            }
        }
        if (!replaced) drives.add(drive);
        return write(drives);
    }

    synchronized boolean remove(String id) {
        List<NetworkDrive> drives = loadAll();
        for (int index = drives.size() - 1; index >= 0; index--) {
            if (drives.get(index).getId().equals(id)) drives.remove(index);
        }
        return write(drives);
    }

    private boolean write(List<NetworkDrive> drives) {
        try {
            JSONArray array = new JSONArray();
            for (NetworkDrive drive : drives) array.put(drive.toJson());
            return preferences.edit().putString(DRIVE_LIST, array.toString()).commit();
        } catch (Exception ignored) {
            return false;
        }
    }
}
