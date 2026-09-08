package de.matthiasennen.moviehub;

import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Device-local, D-Pad-capable SMB connection manager. */
public final class NetworkSettingsActivity extends ComponentActivity {
    private static final int COLOR_BG = Color.rgb(9, 10, 16);
    private static final int COLOR_SURFACE = Color.rgb(24, 27, 38);
    private static final int COLOR_TEXT = Color.rgb(244, 246, 252);
    private static final int COLOR_MUTED = Color.rgb(178, 184, 201);
    private static final int COLOR_GREEN = Color.rgb(83, 205, 128);
    private static final int COLOR_YELLOW = Color.rgb(244, 190, 75);
    private static final int COLOR_RED = Color.rgb(239, 100, 100);
    private static final int COLOR_GRAY = Color.rgb(150, 156, 174);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String, ConnectionStatus> statuses = new HashMap<>();
    private NetworkConnectionStore connectionStore;
    private CredentialStore credentialStore;
    private LinearLayout listContainer;
    private TextView emptyView;

    private static final class ConnectionStatus {
        final int color;
        final String text;

        ConnectionStatus(int color, String text) {
            this.color = color;
            this.text = text;
        }
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        connectionStore = new NetworkConnectionStore(this);
        credentialStore = new CredentialStore(this);
        createContent();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finish();
            }
        });
        refreshAllConnections();
    }

    private void createContent() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(30), dp(22), dp(30), dp(24));
        root.setBackgroundColor(COLOR_BG);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout heading = new LinearLayout(this);
        heading.setOrientation(LinearLayout.VERTICAL);
        TextView kicker = text("EINSTELLUNGEN", 12, COLOR_YELLOW, true);
        heading.addView(kicker);
        TextView title = text("Netzlaufwerke", 28, COLOR_TEXT, true);
        heading.addView(title);
        header.addView(heading, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        Button close = actionButton("× Schließen");
        close.setOnClickListener(view -> finish());
        header.addView(close);
        root.addView(header);

        TextView intro = text(
                "SMB-Verbindungen gelten für Movie Hub auf diesem Gerät. Zugangsdaten werden niemals in der Cloud gespeichert.",
                16, COLOR_MUTED, false);
        LinearLayout.LayoutParams introParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        introParams.setMargins(0, dp(14), 0, dp(18));
        root.addView(intro, introParams);

        LinearLayout topActions = new LinearLayout(this);
        boolean compact = getResources().getConfiguration().screenWidthDp < 600;
        topActions.setOrientation(compact ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        topActions.setGravity(Gravity.START);
        Button add = actionButton("+ Netzlaufwerk hinzufügen");
        add.setOnClickListener(view -> showConnectionDialog(null));
        topActions.addView(add);
        Button refresh = actionButton("Alle prüfen");
        refresh.setOnClickListener(view -> refreshAllConnections());
        LinearLayout.LayoutParams refreshParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        refreshParams.setMargins(compact ? 0 : dp(12), compact ? dp(8) : 0, 0, 0);
        topActions.addView(refresh, refreshParams);
        root.addView(topActions);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        listContainer = new LinearLayout(this);
        listContainer.setOrientation(LinearLayout.VERTICAL);
        listContainer.setPadding(0, dp(18), 0, dp(18));
        scroll.addView(listContainer, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        emptyView = text(
                "Noch kein Netzlaufwerk eingerichtet. Bereits verwendete SMB-Freigaben erscheinen nach dem nächsten Abspielen automatisch hier.",
                16, COLOR_MUTED, false);
        emptyView.setPadding(dp(20), dp(24), dp(20), dp(24));

        setContentView(root);
        add.requestFocus();
    }

    private void renderConnections() {
        Object focusedTag = getCurrentFocus() == null ? null : getCurrentFocus().getTag();
        listContainer.removeAllViews();
        List<SmbConnection> connections = connectionStore.loadAll();
        if (connections.isEmpty()) {
            listContainer.addView(emptyView);
            return;
        }
        for (SmbConnection connection : connections) {
            listContainer.addView(createConnectionCard(connection));
        }
        if (focusedTag != null) {
            View replacement = listContainer.findViewWithTag(focusedTag);
            if (replacement != null) replacement.requestFocus();
        }
    }

    private View createConnectionCard(SmbConnection connection) {
        LinearLayout card = new LinearLayout(this);
        boolean compact = getResources().getConfiguration().screenWidthDp < 600;
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(18), dp(20), dp(18));
        card.setBackgroundColor(COLOR_SURFACE);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardParams.setMargins(0, 0, 0, dp(14));
        card.setLayoutParams(cardParams);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(compact ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.TOP);
        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.addView(text(connection.getName(), 20, COLOR_TEXT, true));
        String endpoint = connection.getDisplayEndpoint();
        if (!connection.getBasePath().isEmpty()) endpoint += "/" + connection.getBasePath();
        copy.addView(text(endpoint, 14, COLOR_MUTED, false));
        top.addView(copy, new LinearLayout.LayoutParams(
                compact ? LinearLayout.LayoutParams.MATCH_PARENT : 0,
                LinearLayout.LayoutParams.WRAP_CONTENT, compact ? 0 : 1));

        ConnectionStatus status = statusFor(connection);
        TextView statusView = text("● " + status.text, 14, status.color, true);
        statusView.setGravity(compact ? Gravity.START : Gravity.END);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        statusParams.setMargins(0, compact ? dp(8) : 0, 0, 0);
        top.addView(statusView, statusParams);
        card.addView(top);

        TextView mode = text(connection.usesPersistentCredentials()
                        ? "Automatische Verbindung · Zugangsdaten geschützt gespeichert"
                        : "Nur aktuelle App-Sitzung · keine dauerhafte Speicherung",
                14, COLOR_MUTED, false);
        LinearLayout.LayoutParams modeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        modeParams.setMargins(0, dp(10), 0, dp(12));
        card.addView(mode, modeParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(compact ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        if (connection.isEnabled()) {
            Button check = actionButton("Erneut prüfen");
            check.setTag(connection.getEndpointKey() + ":check");
            check.setOnClickListener(view -> checkConnection(connection.withEnabled(true)));
            actions.addView(check);

            Button disconnect = actionButton("Verbindung trennen");
            disconnect.setTag(connection.getEndpointKey() + ":toggle");
            disconnect.setOnClickListener(view -> disconnect(connection));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            params.setMargins(compact ? 0 : dp(10), compact ? dp(8) : 0, 0, 0);
            actions.addView(disconnect, params);
        } else {
            Button connect = actionButton("Verbinden");
            connect.setTag(connection.getEndpointKey() + ":toggle");
            connect.setOnClickListener(view -> connect(connection));
            actions.addView(connect);
        }

        Button edit = actionButton("Bearbeiten");
        edit.setTag(connection.getEndpointKey() + ":edit");
        edit.setOnClickListener(view -> showConnectionDialog(connection));
        LinearLayout.LayoutParams editParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        editParams.setMargins(compact ? 0 : dp(10), compact ? dp(8) : 0, 0, 0);
        actions.addView(edit, editParams);

        Button remove = actionButton("Entfernen");
        remove.setTag(connection.getEndpointKey() + ":remove");
        remove.setOnClickListener(view -> confirmRemove(connection));
        LinearLayout.LayoutParams removeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        removeParams.setMargins(compact ? 0 : dp(10), compact ? dp(8) : 0, 0, 0);
        actions.addView(remove, removeParams);
        card.addView(actions);
        return card;
    }

    private ConnectionStatus statusFor(SmbConnection connection) {
        if (!connection.isEnabled()) return new ConnectionStatus(COLOR_GRAY, "Getrennt");
        ConnectionStatus status = statuses.get(connection.getEndpointKey());
        return status == null ? new ConnectionStatus(COLOR_GRAY, "Noch nicht geprüft") : status;
    }

    private void refreshAllConnections() {
        List<SmbConnection> connections = connectionStore.loadAll();
        for (SmbConnection connection : connections) {
            if (connection.isEnabled()) {
                statuses.put(connection.getEndpointKey(),
                        new ConnectionStatus(COLOR_YELLOW, "Wird geprüft …"));
            }
        }
        renderConnections();
        for (SmbConnection connection : connections) {
            if (connection.isEnabled()) testInBackground(connection);
        }
    }

    private void checkConnection(SmbConnection connection) {
        connectionStore.save(connection.withEnabled(true));
        statuses.put(connection.getEndpointKey(),
                new ConnectionStatus(COLOR_YELLOW, "Wird geprüft …"));
        renderConnections();
        testInBackground(connection.withEnabled(true));
    }

    private void testInBackground(SmbConnection connection) {
        SmbCredentials credentials = credentialsFor(connection);
        if (credentials == null) {
            statuses.put(connection.getEndpointKey(),
                    new ConnectionStatus(COLOR_RED, "Zugangsdaten fehlen"));
            renderConnections();
            return;
        }
        executor.submit(() -> {
            SmbConnectionTester.Result result = SmbConnectionTester.test(connection, credentials);
            runOnUiThread(() -> {
                statuses.put(connection.getEndpointKey(), new ConnectionStatus(
                        result.successful ? COLOR_GREEN : COLOR_RED, result.message));
                renderConnections();
            });
        });
    }

    private void connect(SmbConnection connection) {
        if (credentialsFor(connection) == null) {
            showConnectionDialog(connection);
            return;
        }
        checkConnection(connection.withEnabled(true));
    }

    private void disconnect(SmbConnection connection) {
        connectionStore.save(connection.withEnabled(false));
        if (!connection.usesPersistentCredentials()) {
            SessionCredentialStore.remove(connection.getEndpointKey());
        }
        statuses.remove(connection.getEndpointKey());
        renderConnections();
    }

    private void showConnectionDialog(@Nullable SmbConnection existing) {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(6), dp(24), 0);

        EditText name = input("Bezeichnung, z. B. FRITZ!NAS – MyPassport", false);
        EditText host = input("Server, z. B. fritz.box", false);
        EditText port = input("Port, normalerweise 445", false);
        port.setInputType(InputType.TYPE_CLASS_NUMBER);
        EditText share = input("Freigabe, z. B. share", false);
        EditText basePath = input("Basisordner (optional)", false);
        EditText username = input("Benutzername", false);
        EditText password = input(existing == null ? "Kennwort" : "Kennwort – leer lassen für unverändert", true);
        CheckBox remember = new CheckBox(this);
        remember.setText("Zugangsdaten auf diesem Gerät speichern und automatisch verbinden");
        remember.setTextColor(COLOR_TEXT);
        remember.setChecked(existing == null || existing.usesPersistentCredentials());

        if (existing != null) {
            name.setText(existing.getName());
            host.setText(existing.getHost());
            port.setText(String.valueOf(existing.getPort()));
            share.setText(existing.getShare());
            basePath.setText(existing.getBasePath());
            SmbCredentials saved = credentialsFor(existing);
            if (saved != null) username.setText(saved.getUsername());
        } else {
            port.setText("445");
        }

        content.addView(name);
        content.addView(host);
        content.addView(port);
        content.addView(share);
        content.addView(basePath);
        content.addView(username);
        content.addView(password);
        content.addView(remember);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(existing == null ? "Netzlaufwerk hinzufügen" : "Netzlaufwerk bearbeiten")
                .setView(scroll)
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton(existing == null ? "Verbinden und prüfen" : "Speichern und prüfen", null)
                .create();
        dialog.setOnShowListener(value -> {
            host.requestFocus();
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> {
                try {
                    int parsedPort = Integer.parseInt(port.getText().toString().trim());
                    SmbConnection updated = new SmbConnection(
                            name.getText().toString(), host.getText().toString(), parsedPort,
                            share.getText().toString(), basePath.getText().toString(),
                            remember.isChecked(), true);
                    SmbCredentials oldCredentials = existing == null ? null : credentialsFor(existing);
                    String user = username.getText().toString().trim();
                    if (user.isEmpty()) {
                        username.setError("Bitte einen Benutzernamen eingeben.");
                        return;
                    }
                    String enteredPassword = password.getText().toString();
                    SmbCredentials updatedCredentials = enteredPassword.isEmpty() && oldCredentials != null
                            ? new SmbCredentials(user, oldCredentials.getPassword())
                            : new SmbCredentials(user, enteredPassword);

                    saveConnection(existing, updated, updatedCredentials);
                    dialog.dismiss();
                    checkConnection(updated);
                } catch (NumberFormatException error) {
                    port.setError("Bitte einen gültigen Port eingeben.");
                } catch (IllegalArgumentException error) {
                    host.setError(error.getMessage());
                } catch (Exception error) {
                    host.setError("Netzlaufwerk konnte nicht gespeichert werden.");
                }
            });
        });
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
    }

    private void saveConnection(@Nullable SmbConnection existing, SmbConnection updated,
                                SmbCredentials credentials) {
        String oldKey = existing == null ? null : existing.getEndpointKey();
        String newKey = updated.getEndpointKey();

        if (oldKey != null && !oldKey.equals(newKey)) {
            credentialStore.remove(oldKey);
            SessionCredentialStore.remove(oldKey);
            statuses.remove(oldKey);
        }
        if (updated.usesPersistentCredentials()) {
            if (!credentialStore.save(newKey, credentials)) {
                throw new IllegalStateException("Zugangsdaten konnten nicht geschützt gespeichert werden.");
            }
            SessionCredentialStore.remove(newKey);
        } else {
            credentialStore.remove(newKey);
            SessionCredentialStore.save(newKey, credentials);
        }

        if (oldKey == null) connectionStore.save(updated);
        else connectionStore.replace(oldKey, updated);
    }

    private SmbCredentials credentialsFor(SmbConnection connection) {
        if (connection.usesPersistentCredentials()) {
            return credentialStore.load(connection.getEndpointKey());
        }
        return SessionCredentialStore.load(connection.getEndpointKey());
    }

    private void confirmRemove(SmbConnection connection) {
        new AlertDialog.Builder(this)
                .setTitle("Netzlaufwerk entfernen?")
                .setMessage("„" + connection.getName()
                        + "“ wird nur von diesem Gerät entfernt. Gespeicherte Filmverknüpfungen bleiben bestehen.")
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton("Entfernen", (dialog, which) -> {
                    String key = connection.getEndpointKey();
                    connectionStore.remove(key);
                    credentialStore.remove(key);
                    SessionCredentialStore.remove(key);
                    statuses.remove(key);
                    renderConnections();
                })
                .show();
    }

    private EditText input(String hint, boolean password) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setSingleLine(true);
        field.setTextColor(COLOR_TEXT);
        field.setHintTextColor(COLOR_MUTED);
        if (password) {
            field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        }
        return field;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setLineSpacing(0, 1.15f);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private Button actionButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setFocusable(true);
        return button;
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
