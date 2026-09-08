package de.matthiasennen.moviehub;

import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Device-local SMB connection management reached from Movie Hub settings. */
public final class NetworkDriveSettingsActivity extends ComponentActivity {
    private static final int COLOR_BACKGROUND = Color.rgb(9, 10, 16);
    private static final int COLOR_PANEL = Color.rgb(22, 26, 36);
    private static final int COLOR_TEXT = Color.rgb(247, 248, 252);
    private static final int COLOR_MUTED = Color.rgb(181, 187, 202);
    private static final int COLOR_LINE = Color.rgb(61, 68, 84);
    private static final int COLOR_GRAY = Color.rgb(167, 174, 190);
    private static final int COLOR_YELLOW = Color.rgb(244, 201, 93);
    private static final int COLOR_GREEN = Color.rgb(100, 217, 138);
    private static final int COLOR_RED = Color.rgb(255, 123, 123);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Map<String, DriveStatus> statuses = new HashMap<>();
    private final Map<String, TextView> statusViews = new HashMap<>();
    private NetworkDriveStore driveStore;
    private CredentialStore credentialStore;
    private LinearLayout driveList;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        driveStore = new NetworkDriveStore(this);
        credentialStore = new CredentialStore(this);
        createContent();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finish();
            }
        });
        refreshAndCheckAll();
    }

    private void createContent() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(COLOR_BACKGROUND);
        scroll.setFillViewport(true);

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(34), dp(28), dp(34), dp(38));
        scroll.addView(page, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));

        LinearLayout heading = new LinearLayout(this);
        heading.setOrientation(LinearLayout.HORIZONTAL);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        page.addView(heading, matchWrap());

        LinearLayout headingCopy = new LinearLayout(this);
        headingCopy.setOrientation(LinearLayout.VERTICAL);
        heading.addView(headingCopy, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView kicker = text("EINSTELLUNGEN", 13, COLOR_GREEN, true);
        headingCopy.addView(kicker);
        TextView title = text("Netzlaufwerke", 30, COLOR_TEXT, true);
        headingCopy.addView(title);

        Button close = actionButton("Zurück");
        close.setOnClickListener(view -> finish());
        heading.addView(close);

        TextView description = text(
                "SMB-Verbindungen gelten auf diesem Gerät für alle Movie-Hub-Profile. "
                        + "Zugangsdaten werden niemals mit dem Movie-Hub-Konto synchronisiert.",
                16, COLOR_MUTED, false);
        LinearLayout.LayoutParams descriptionParams = matchWrap();
        descriptionParams.topMargin = dp(12);
        descriptionParams.bottomMargin = dp(22);
        page.addView(description, descriptionParams);

        Button add = actionButton("+ Netzlaufwerk verbinden");
        add.setOnClickListener(view -> showDriveDialog(null));
        LinearLayout.LayoutParams addParams = wrapWrap();
        addParams.bottomMargin = dp(20);
        page.addView(add, addParams);

        driveList = new LinearLayout(this);
        driveList.setOrientation(LinearLayout.VERTICAL);
        page.addView(driveList, matchWrap());
        setContentView(scroll);
    }

    private void refreshAndCheckAll() {
        List<NetworkDrive> drives = driveStore.loadAll();
        renderDrives(drives);
        for (NetworkDrive drive : drives) {
            SmbCredentials credentials = credentialsFor(drive.getCredentialKey());
            if (credentials == null) {
                setStatus(drive, DriveStatus.gray("Nicht verbunden · Anmeldung erforderlich"));
            } else {
                testDrive(drive, credentials, false);
            }
        }
    }

    private void renderDrives(List<NetworkDrive> drives) {
        driveList.removeAllViews();
        statusViews.clear();
        if (drives.isEmpty()) {
            TextView empty = text(
                    "Noch kein Netzlaufwerk eingerichtet. Verbinde hier beispielsweise deine FRITZ!NAS-Freigabe.",
                    17, COLOR_MUTED, false);
            empty.setPadding(dp(18), dp(22), dp(18), dp(22));
            empty.setBackground(panelBackground());
            driveList.addView(empty, matchWrap());
            return;
        }

        for (NetworkDrive drive : drives) {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(20), dp(18), dp(20), dp(18));
            card.setBackground(panelBackground());
            LinearLayout.LayoutParams cardParams = matchWrap();
            cardParams.bottomMargin = dp(16);
            driveList.addView(card, cardParams);

            card.addView(text(drive.getLabel(), 21, COLOR_TEXT, true));
            TextView endpoint = text(drive.getDisplayEndpoint(), 15, COLOR_MUTED, false);
            LinearLayout.LayoutParams endpointParams = matchWrap();
            endpointParams.topMargin = dp(4);
            card.addView(endpoint, endpointParams);

            TextView status = text("● Noch nicht geprüft", 15, COLOR_GRAY, true);
            status.setContentDescription("Status: Noch nicht geprüft");
            LinearLayout.LayoutParams statusParams = matchWrap();
            statusParams.topMargin = dp(12);
            statusParams.bottomMargin = dp(12);
            card.addView(status, statusParams);
            statusViews.put(drive.getId(), status);
            applyStatus(status, statuses.getOrDefault(drive.getId(), DriveStatus.gray("Noch nicht geprüft")));

            LinearLayout primaryActions = new LinearLayout(this);
            primaryActions.setOrientation(LinearLayout.HORIZONTAL);
            primaryActions.setGravity(Gravity.START);
            card.addView(primaryActions, matchWrap());

            Button retry = smallButton("Erneut prüfen");
            retry.setOnClickListener(view -> {
                SmbCredentials credentials = credentialsFor(drive.getCredentialKey());
                if (credentials == null) showDriveDialog(drive);
                else testDrive(drive, credentials, false);
            });
            primaryActions.addView(retry, actionParams());

            Button edit = smallButton("Bearbeiten");
            edit.setOnClickListener(view -> showDriveDialog(drive));
            primaryActions.addView(edit, actionParams());

            LinearLayout secondaryActions = new LinearLayout(this);
            secondaryActions.setOrientation(LinearLayout.HORIZONTAL);
            secondaryActions.setGravity(Gravity.START);
            LinearLayout.LayoutParams secondaryParams = matchWrap();
            secondaryParams.topMargin = dp(8);
            card.addView(secondaryActions, secondaryParams);

            Button disconnect = smallButton("Verbindung trennen");
            disconnect.setOnClickListener(view -> disconnect(drive));
            secondaryActions.addView(disconnect, actionParams());

            Button remove = smallButton("Entfernen");
            remove.setOnClickListener(view -> confirmRemove(drive));
            secondaryActions.addView(remove, actionParams());
        }
    }

    private void showDriveDialog(@Nullable NetworkDrive existing) {
        SmbCredentials persistent = existing == null ? null
                : credentialStore.load(existing.getCredentialKey());
        SmbCredentials current = existing == null ? null
                : credentialsFor(existing.getCredentialKey());

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(8), dp(22), 0);

        EditText label = field("Bezeichnung, z. B. FRITZ!NAS – MyPassport");
        EditText host = field("Server oder IP-Adresse, z. B. fritz.box");
        EditText port = field("Port");
        port.setInputType(InputType.TYPE_CLASS_NUMBER);
        EditText share = field("Freigabename, z. B. share");
        EditText baseFolder = field("Basisordner (optional), z. B. MyPassport/Movies");
        EditText username = field("Benutzername");
        EditText password = field("Kennwort");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);

        if (existing != null) {
            label.setText(existing.getLabel());
            host.setText(existing.getHost());
            port.setText(String.valueOf(existing.getPort()));
            share.setText(existing.getShare());
            baseFolder.setText(existing.getBaseFolder().replace('\\', '/'));
        } else {
            port.setText("445");
        }
        if (current != null) {
            username.setText(current.getUsername());
            password.setText(current.getPassword());
        }

        content.addView(label);
        content.addView(host);
        content.addView(port);
        content.addView(share);
        content.addView(baseFolder);
        content.addView(username);
        content.addView(password);

        CheckBox remember = new CheckBox(this);
        remember.setText("Zugangsdaten auf diesem Gerät speichern und automatisch verbinden");
        remember.setChecked(existing == null || persistent != null);
        remember.setPadding(0, dp(8), 0, 0);
        content.addView(remember);

        TextView hint = text(
                "Ohne diese Option gelten Benutzername und Kennwort nur bis zum Trennen oder App-Neustart.",
                13, Color.DKGRAY, false);
        content.addView(hint);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(existing == null ? "Netzlaufwerk verbinden" : "Netzlaufwerk bearbeiten")
                .setView(scroll)
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton("Verbinden und prüfen", null)
                .create();
        dialog.setOnShowListener(value -> {
            label.requestFocus();
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> {
                try {
                    int parsedPort = Integer.parseInt(port.getText().toString().trim());
                    NetworkDrive drive = new NetworkDrive(
                            existing == null ? null : existing.getId(),
                            label.getText().toString(), host.getText().toString(), parsedPort,
                            share.getText().toString(), baseFolder.getText().toString());
                    String user = username.getText().toString().trim();
                    if (user.isEmpty()) {
                        username.setError("Bitte einen Benutzernamen eingeben.");
                        return;
                    }
                    SmbCredentials credentials = new SmbCredentials(user, password.getText().toString());
                    if (isDuplicateEndpoint(drive, existing)) {
                        host.setError("Für diesen Server und diese Freigabe besteht bereits ein Eintrag.");
                        return;
                    }
                    if (existing != null && !existing.getCredentialKey().equals(drive.getCredentialKey())) {
                        credentialStore.remove(existing.getCredentialKey());
                        SessionCredentialStore.remove(existing.getCredentialKey());
                    }
                    if (!driveStore.save(drive)) {
                        Toast.makeText(this, "Netzlaufwerk konnte nicht gespeichert werden.", Toast.LENGTH_LONG).show();
                        return;
                    }
                    if (remember.isChecked()) {
                        SessionCredentialStore.save(drive.getCredentialKey(), credentials);
                    } else {
                        credentialStore.remove(drive.getCredentialKey());
                        SessionCredentialStore.save(drive.getCredentialKey(), credentials);
                    }
                    dialog.dismiss();
                    renderDrives(driveStore.loadAll());
                    testDrive(drive, credentials, remember.isChecked());
                } catch (NumberFormatException error) {
                    port.setError("Bitte einen gültigen Port eingeben.");
                } catch (IllegalArgumentException error) {
                    Toast.makeText(this, error.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        });
        dialog.show();
    }

    private boolean isDuplicateEndpoint(NetworkDrive candidate, @Nullable NetworkDrive existing) {
        for (NetworkDrive drive : driveStore.loadAll()) {
            if ((existing == null || !drive.getId().equals(existing.getId()))
                    && drive.getCredentialKey().equals(candidate.getCredentialKey())) return true;
        }
        return false;
    }

    private void testDrive(NetworkDrive drive, SmbCredentials credentials, boolean persistOnSuccess) {
        setStatus(drive, DriveStatus.yellow("Verbindung wird geprüft …"));
        executor.execute(() -> {
            SmbConnectionTester.Result result = SmbConnectionTester.test(drive, credentials);
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                if (result.isSuccess()) {
                    if (persistOnSuccess) {
                        if (credentialStore.save(drive.getCredentialKey(), credentials)) {
                            SessionCredentialStore.remove(drive.getCredentialKey());
                        } else {
                            setStatus(drive, DriveStatus.red(
                                    "Verbindung erfolgreich, Zugangsdaten konnten aber nicht geschützt gespeichert werden."));
                            return;
                        }
                    }
                    setStatus(drive, DriveStatus.green(result.getMessage()));
                } else {
                    setStatus(drive, DriveStatus.red(result.getMessage()));
                }
            });
        });
    }

    private void disconnect(NetworkDrive drive) {
        SessionCredentialStore.remove(drive.getCredentialKey());
        if (credentialStore.load(drive.getCredentialKey()) != null) {
            setStatus(drive, DriveStatus.gray("Getrennt · automatische Verbindung bleibt gespeichert"));
        } else {
            setStatus(drive, DriveStatus.gray("Getrennt · Anmeldung erforderlich"));
        }
    }

    private void confirmRemove(NetworkDrive drive) {
        new AlertDialog.Builder(this)
                .setTitle("Netzlaufwerk entfernen?")
                .setMessage(drive.getLabel() + " wird nur von diesem Gerät entfernt. Gespeicherte Filmverknüpfungen bleiben erhalten.")
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton("Entfernen", (dialog, which) -> {
                    credentialStore.remove(drive.getCredentialKey());
                    SessionCredentialStore.remove(drive.getCredentialKey());
                    driveStore.remove(drive.getId());
                    statuses.remove(drive.getId());
                    refreshAndCheckAll();
                })
                .show();
    }

    private SmbCredentials credentialsFor(String endpoint) {
        SmbCredentials session = SessionCredentialStore.load(endpoint);
        return session != null ? session : credentialStore.load(endpoint);
    }

    private void setStatus(NetworkDrive drive, DriveStatus status) {
        statuses.put(drive.getId(), status);
        TextView view = statusViews.get(drive.getId());
        if (view != null) applyStatus(view, status);
    }

    private void applyStatus(TextView view, DriveStatus status) {
        view.setText("● " + status.message);
        view.setTextColor(status.color);
        view.setContentDescription("Status: " + status.message);
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private EditText field(String hint) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setSingleLine(true);
        field.setSelectAllOnFocus(false);
        return field;
    }

    private Button actionButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setFocusable(true);
        return button;
    }

    private Button smallButton(String label) {
        Button button = actionButton(label);
        button.setTextSize(13);
        button.setMinHeight(dp(46));
        return button;
    }

    private LinearLayout.LayoutParams actionParams() {
        LinearLayout.LayoutParams params = wrapWrap();
        params.rightMargin = dp(8);
        return params;
    }

    private GradientDrawable panelBackground() {
        GradientDrawable background = new GradientDrawable();
        background.setColor(COLOR_PANEL);
        background.setCornerRadius(dp(14));
        background.setStroke(dp(1), COLOR_LINE);
        return background;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams wrapWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
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

    private static final class DriveStatus {
        private final String message;
        private final int color;

        private DriveStatus(String message, int color) {
            this.message = message;
            this.color = color;
        }

        static DriveStatus gray(String message) { return new DriveStatus(message, COLOR_GRAY); }
        static DriveStatus yellow(String message) { return new DriveStatus(message, COLOR_YELLOW); }
        static DriveStatus green(String message) { return new DriveStatus(message, COLOR_GREEN); }
        static DriveStatus red(String message) { return new DriveStatus(message, COLOR_RED); }
    }
}
