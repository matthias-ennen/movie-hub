package de.matthiasennen.moviehub;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Stores enumerable SMB connection metadata locally; credentials stay separate. */
final class NetworkConnectionStore {
    private static final String PREFERENCES = "movie_hub_smb_connections";
    private static final String CONNECTIONS = "connections_v1";
    private static final String MIGRATION_V2_DONE = "migration_v2_canonical_endpoints_done";
    private final SharedPreferences preferences;

    NetworkConnectionStore(Context context) {
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    synchronized void migrateCanonicalEndpoints(CredentialStore credentialStore) {
        if (preferences.getBoolean(MIGRATION_V2_DONE, false)) return;

        List<SmbConnection> raw = readRaw();
        if (raw.isEmpty()) {
            preferences.edit().putBoolean(MIGRATION_V2_DONE, true).commit();
            return;
        }

        Map<String, List<SmbConnection>> groups = new LinkedHashMap<>();
        for (SmbConnection connection : raw) {
            groups.computeIfAbsent(connection.getEndpointKey(), ignored -> new ArrayList<>())
                    .add(connection);
        }

        List<SmbConnection> consolidated = new ArrayList<>();
        boolean credentialsSafe = true;
        for (Map.Entry<String, List<SmbConnection>> entry : groups.entrySet()) {
            List<SmbConnection> group = entry.getValue();
            SmbConnection selected = selectConnection(group);
            consolidated.add(selected);

            List<String> legacyKeys = new ArrayList<>();
            for (SmbConnection connection : group) {
                legacyKeys.add(connection.getLegacyEndpointKey());
            }
            if (!credentialStore.migrateAliases(entry.getKey(), legacyKeys)) {
                credentialsSafe = false;
            }
        }

        // Metadata may safely be consolidated even when conflicting credentials exist: no media
        // paths are altered, and conflicting encrypted legacy credentials remain untouched.
        write(consolidated);
        if (credentialsSafe) {
            preferences.edit().putBoolean(MIGRATION_V2_DONE, true).commit();
        }
    }

    synchronized List<SmbConnection> loadAll() {
        List<SmbConnection> result = readRaw();
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

    private List<SmbConnection> readRaw() {
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
        return result;
    }

    private SmbConnection selectConnection(List<SmbConnection> group) {
        SmbConnection first = group.get(0);
        String basePath = first.getBasePath();
        boolean enabled = first.isEnabled();
        boolean persistent = first.usesPersistentCredentials();
        for (SmbConnection connection : group) {
            if (basePath.isEmpty() && !connection.getBasePath().isEmpty()) {
                basePath = connection.getBasePath();
            }
            enabled = enabled || connection.isEnabled();
            persistent = persistent || connection.usesPersistentCredentials();
        }
        return new SmbConnection(first.getName(), first.getHost(), first.getPort(),
                first.getShare(), basePath, persistent, enabled);
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
