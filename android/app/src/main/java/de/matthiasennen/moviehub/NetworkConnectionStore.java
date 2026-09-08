package de.matthiasennen.moviehub;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Stores enumerable SMB connection metadata locally; credentials stay separate. */
final class NetworkConnectionStore {
    private static final String PREFERENCES = "movie_hub_smb_connections";
    private static final String CONNECTIONS = "connections_v1";
    private final SharedPreferences preferences;

    NetworkConnectionStore(Context context) {
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    synchronized List<SmbConnection> loadAll() {
        List<SmbConnection> result = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(preferences.getString(CONNECTIONS, "[]"));
            for (int index = 0; index < array.length(); index++) {
                try {
                    result.add(SmbConnection.fromJson(array.getJSONObject(index)));
                } catch (Exception ignored) {
                    // Skip one corrupt local record without hiding valid connections.
                }
            }
        } catch (Exception ignored) {
            // A corrupt list behaves like an empty list and can be rebuilt locally.
        }
        sortByName(result);
        return result;
    }

    synchronized SmbConnection find(String endpointKey) {
        for (SmbConnection connection : loadAll()) {
            if (connection.getEndpointKey().equals(endpointKey)) return connection;
        }
        return null;
    }

    synchronized SmbConnection ensure(SmbLocation location, boolean persistentCredentials) {
        SmbConnection existing = find(location.getCredentialKey());
        if (existing != null) return existing;
        SmbConnection created = new SmbConnection(
                location.getDisplayEndpoint(), location.getHost(), location.getPort(),
                location.getShare(), "", persistentCredentials, true);
        save(created);
        return created;
    }

    synchronized void save(SmbConnection connection) {
        List<SmbConnection> all = loadAll();
        removeEndpoint(all, connection.getEndpointKey());
        all.add(connection);
        write(all);
    }

    synchronized void replace(String previousEndpointKey, SmbConnection connection) {
        List<SmbConnection> all = loadAll();
        removeEndpoint(all, previousEndpointKey);
        removeEndpoint(all, connection.getEndpointKey());
        all.add(connection);
        write(all);
    }

    synchronized void remove(String endpointKey) {
        List<SmbConnection> all = loadAll();
        removeEndpoint(all, endpointKey);
        write(all);
    }

    private void write(List<SmbConnection> connections) {
        try {
            sortByName(connections);
            JSONArray array = new JSONArray();
            for (SmbConnection connection : connections) array.put(connection.toJson());
            preferences.edit().putString(CONNECTIONS, array.toString()).commit();
        } catch (Exception error) {
            throw new IllegalStateException("Netzlaufwerke konnten nicht gespeichert werden.", error);
        }
    }

    private void removeEndpoint(List<SmbConnection> connections, String endpointKey) {
        for (int index = connections.size() - 1; index >= 0; index--) {
            if (connections.get(index).getEndpointKey().equals(endpointKey)) {
                connections.remove(index);
            }
        }
    }

    private void sortByName(List<SmbConnection> connections) {
        Collections.sort(connections, new Comparator<SmbConnection>() {
            @Override
            public int compare(SmbConnection left, SmbConnection right) {
                return String.CASE_INSENSITIVE_ORDER.compare(left.getName(), right.getName());
            }
        });
    }
}
