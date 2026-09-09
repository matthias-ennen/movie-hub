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
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Device-wide, D-Pad-capable TMDB API token and account-session manager. */
public final class TmdbSettingsActivity extends ComponentActivity {
    private static final int COLOR_BG = Color.rgb(9, 10, 16);
    private static final int COLOR_SURFACE = Color.rgb(24, 27, 38);
    private static final int COLOR_TEXT = Color.rgb(244, 246, 252);
    private static final int COLOR_MUTED = Color.rgb(178, 184, 201);
    private static final int COLOR_GREEN = Color.rgb(83, 205, 128);
    private static final int COLOR_YELLOW = Color.rgb(244, 190, 75);
    private static final int COLOR_RED = Color.rgb(239, 100, 100);
    private static final int COLOR_GRAY = Color.rgb(150, 156, 174);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TmdbCredentialStore credentialStore;
    private boolean busy;

    private TextView apiStatus;
    private EditText apiTokenInput;
    private Button saveApiButton;
    private LinearLayout accountCard;
    private TextView accountStatus;
    private TextView accountHint;
    private EditText usernameInput;
    private EditText passwordInput;
    private Button loginButton;
    private Button checkButton;
    private Button disconnectButton;
    private Button removeButton;
    private TextView feedback;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        credentialStore = new TmdbCredentialStore(this);
        createContent();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finish();
            }
        });
        refreshUi();
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
        heading.addView(text("EINSTELLUNGEN", 12, COLOR_YELLOW, true));
        heading.addView(text("The Movie Database", 28, COLOR_TEXT, true));
        header.addView(heading, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        Button close = actionButton("× Schließen");
        close.setOnClickListener(view -> finish());
        header.addView(close);
        root.addView(header);

        TextView intro = text(
                "Die persönliche TMDB-Verbindung gilt für Movie Hub auf diesem Gerät und wird von allen Movie-Hub-Profilen gemeinsam genutzt. API-Token und Session-ID bleiben verschlüsselt auf diesem Gerät.",
                16, COLOR_MUTED, false);
        LinearLayout.LayoutParams introParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        introParams.setMargins(0, dp(14), 0, dp(18));
        root.addView(intro, introParams);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.addView(createApiCard());
        content.addView(createAccountCard());

        feedback = text("", 14, COLOR_MUTED, false);
        feedback.setVisibility(View.GONE);
        LinearLayout.LayoutParams feedbackParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        feedbackParams.setMargins(0, dp(4), 0, dp(18));
        content.addView(feedback, feedbackParams);

        scroll.addView(content, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));

        setContentView(root);
        apiTokenInput.requestFocus();
    }

    private View createApiCard() {
        LinearLayout card = card();

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.addView(text("1 · API-Zugang", 20, COLOR_TEXT, true));
        copy.addView(text(
                "Trage deinen persönlichen TMDB API Read Access Token ein. Movie Hub prüft ihn vor dem geschützten Speichern.",
                14, COLOR_MUTED, false));
        top.addView(copy, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        apiStatus = text("● Nicht eingerichtet", 14, COLOR_GRAY, true);
        apiStatus.setGravity(Gravity.END);
        top.addView(apiStatus);
        card.addView(top);

        apiTokenInput = input("API Read Access Token", true);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        inputParams.setMargins(0, dp(14), 0, dp(10));
        card.addView(apiTokenInput, inputParams);

        saveApiButton = actionButton("Prüfen und speichern");
        saveApiButton.setOnClickListener(view -> validateAndSaveApiToken());
        card.addView(saveApiButton);
        return card;
    }

    private View createAccountCard() {
        accountCard = card();

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.addView(text("2 · Persönliches TMDB-Konto", 20, COLOR_TEXT, true));
        copy.addView(text(
                "Melde dich direkt bei TMDB an. Movie Hub speichert danach nur die erzeugte Session-ID; dein Passwort wird verworfen.",
                14, COLOR_MUTED, false));
        top.addView(copy, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        accountStatus = text("● Nicht verbunden", 14, COLOR_GRAY, true);
        accountStatus.setGravity(Gravity.END);
        top.addView(accountStatus);
        accountCard.addView(top);

        accountHint = text(
                "Richte zuerst deinen API-Zugang ein, um dein TMDB-Konto verbinden zu können.",
                14, COLOR_YELLOW, false);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hintParams.setMargins(0, dp(12), 0, dp(8));
        accountCard.addView(accountHint, hintParams);

        usernameInput = input("TMDB-Benutzername", false);
        passwordInput = input("TMDB-Passwort", true);
        accountCard.addView(usernameInput);
        accountCard.addView(passwordInput);

        loginButton = actionButton("Anmelden");
        loginButton.setOnClickListener(view -> login());
        LinearLayout.LayoutParams loginParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        loginParams.setMargins(0, dp(8), 0, 0);
        accountCard.addView(loginButton, loginParams);

        LinearLayout connectedActions = new LinearLayout(this);
        boolean compact = getResources().getConfiguration().screenWidthDp < 600;
        connectedActions.setOrientation(compact ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);

        checkButton = actionButton("Verbindung prüfen");
        checkButton.setOnClickListener(view -> checkConnection());
        connectedActions.addView(checkButton);

        disconnectButton = actionButton("TMDB-Konto trennen");
        disconnectButton.setOnClickListener(view -> confirmDisconnect(false));
        LinearLayout.LayoutParams disconnectParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        disconnectParams.setMargins(compact ? 0 : dp(10), compact ? dp(8) : 0, 0, 0);
        connectedActions.addView(disconnectButton, disconnectParams);

        removeButton = actionButton("TMDB vollständig entfernen");
        removeButton.setOnClickListener(view -> confirmDisconnect(true));
        LinearLayout.LayoutParams removeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        removeParams.setMargins(compact ? 0 : dp(10), compact ? dp(8) : 0, 0, 0);
        connectedActions.addView(removeButton, removeParams);

        LinearLayout.LayoutParams connectedParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        connectedParams.setMargins(0, dp(10), 0, 0);
        accountCard.addView(connectedActions, connectedParams);
        return accountCard;
    }

    private void validateAndSaveApiToken() {
        String token = apiTokenInput.getText().toString().trim();
        if (token.isEmpty()) {
            apiTokenInput.setError("Bitte den API Read Access Token eingeben.");
            return;
        }

        TmdbCredentialStore.Credentials before = credentialStore.load();
        boolean clearsExistingSession = before.hasSession()
                && !token.equals(before.getApiReadAccessToken());
        setBusy(true, "API-Zugang wird geprüft …", COLOR_YELLOW);
        executor.submit(() -> {
            try {
                TmdbApiClient.validateApiToken(token);
                if (!credentialStore.saveApiToken(token)) {
                    throw new IllegalStateException("secure-storage");
                }
                runOnUiThread(() -> {
                    apiTokenInput.setText("");
                    refreshUi();
                    setBusy(false,
                            clearsExistingSession
                                    ? "API-Zugang gespeichert. Die bisherige TMDB-Konto-Session wurde wegen des geänderten Tokens getrennt."
                                    : "API-Zugang geprüft und geschützt auf diesem Gerät gespeichert.",
                            COLOR_GREEN);
                });
            } catch (TmdbApiClient.TmdbException error) {
                runOnUiThread(() -> setBusy(false, apiTokenError(error), COLOR_RED));
            } catch (Exception error) {
                runOnUiThread(() -> setBusy(false,
                        "Der API-Zugang konnte nicht geschützt gespeichert werden.", COLOR_RED));
            }
        });
    }

    private void login() {
        TmdbCredentialStore.Credentials credentials = credentialStore.load();
        if (!credentials.hasApiToken()) {
            refreshUi();
            showFeedback("Richte zuerst deinen API-Zugang ein.", COLOR_YELLOW);
            return;
        }

        String username = usernameInput.getText().toString().trim();
        String password = passwordInput.getText().toString();
        if (username.isEmpty()) {
            usernameInput.setError("Bitte deinen TMDB-Benutzernamen eingeben.");
            return;
        }
        if (password.isEmpty()) {
            passwordInput.setError("Bitte dein TMDB-Passwort eingeben.");
            return;
        }

        passwordInput.setText("");
        setBusy(true, "TMDB-Anmeldung wird geprüft …", COLOR_YELLOW);
        executor.submit(() -> {
            try {
                String sessionId = TmdbApiClient.login(
                        credentials.getApiReadAccessToken(), username, password);
                if (!credentialStore.saveSession(sessionId, username)) {
                    try {
                        TmdbApiClient.deleteSession(credentials.getApiReadAccessToken(), sessionId);
                    } catch (Exception ignored) {
                        // The local secure store failed; never expose the new session to the WebView.
                    }
                    throw new IllegalStateException("secure-storage");
                }
                runOnUiThread(() -> {
                    refreshUi();
                    setBusy(false, "TMDB-Konto erfolgreich verbunden.", COLOR_GREEN);
                });
            } catch (TmdbApiClient.TmdbException error) {
                runOnUiThread(() -> setBusy(false, loginError(error), COLOR_RED));
            } catch (Exception error) {
                runOnUiThread(() -> setBusy(false,
                        "Die TMDB-Session konnte nicht geschützt gespeichert werden.", COLOR_RED));
            }
        });
    }

    private void checkConnection() {
        TmdbCredentialStore.Credentials credentials = credentialStore.load();
        if (!credentials.hasApiToken() || !credentials.hasSession()) {
            refreshUi();
            showFeedback("Es ist noch kein vollständig verbundenes TMDB-Konto vorhanden.", COLOR_YELLOW);
            return;
        }

        setBusy(true, "TMDB-Verbindung wird geprüft …", COLOR_YELLOW);
        executor.submit(() -> {
            try {
                TmdbApiClient.validateApiToken(credentials.getApiReadAccessToken());
                TmdbApiClient.validateSession(
                        credentials.getApiReadAccessToken(), credentials.getSessionId());
                runOnUiThread(() -> setBusy(false,
                        "API-Zugang und TMDB-Konto-Session sind gültig.", COLOR_GREEN));
            } catch (TmdbApiClient.TmdbException error) {
                runOnUiThread(() -> setBusy(false,
                        "TMDB-Verbindung konnte nicht bestätigt werden: " + friendlyError(error),
                        COLOR_RED));
            }
        });
    }

    private void confirmDisconnect(boolean removeAll) {
        new AlertDialog.Builder(this)
                .setTitle(removeAll ? "TMDB vollständig entfernen?" : "TMDB-Konto trennen?")
                .setMessage(removeAll
                        ? "API Read Access Token und Konto-Session werden von diesem Gerät entfernt."
                        : "Die persönliche Konto-Session wird beendet. Der gespeicherte API-Zugang bleibt erhalten.")
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton(removeAll ? "Entfernen" : "Trennen",
                        (dialog, which) -> disconnect(removeAll))
                .show();
    }

    private void disconnect(boolean removeAll) {
        TmdbCredentialStore.Credentials credentials = credentialStore.load();
        setBusy(true, removeAll ? "TMDB wird entfernt …" : "TMDB-Konto wird getrennt …",
                COLOR_YELLOW);
        executor.submit(() -> {
            String remoteWarning = null;
            if (credentials.hasApiToken() && credentials.hasSession()) {
                try {
                    TmdbApiClient.deleteSession(
                            credentials.getApiReadAccessToken(), credentials.getSessionId());
                } catch (TmdbApiClient.TmdbException error) {
                    remoteWarning = friendlyError(error);
                }
            }

            if (removeAll) credentialStore.clearAll();
            else credentialStore.clearSession();
            final String warning = remoteWarning;
            runOnUiThread(() -> {
                refreshUi();
                if (warning == null) {
                    setBusy(false,
                            removeAll
                                    ? "TMDB-Zugang wurde vollständig von diesem Gerät entfernt."
                                    : "TMDB-Konto wurde getrennt. Der API-Zugang bleibt gespeichert.",
                            COLOR_GREEN);
                } else {
                    setBusy(false,
                            "Die lokalen TMDB-Zugangsdaten wurden entfernt. TMDB konnte die entfernte Session nicht bestätigen: " + warning,
                            COLOR_YELLOW);
                }
            });
        });
    }

    private void refreshUi() {
        TmdbCredentialStore.Credentials credentials = credentialStore.load();
        boolean hasApi = credentials.hasApiToken();
        boolean connected = credentials.hasSession();

        apiStatus.setText(hasApi ? "● API-Zugang eingerichtet" : "● Nicht eingerichtet");
        apiStatus.setTextColor(hasApi ? COLOR_GREEN : COLOR_GRAY);
        apiTokenInput.setHint(hasApi
                ? "Neuen API Read Access Token eingeben, um ihn zu ändern"
                : "API Read Access Token");

        accountCard.setAlpha(hasApi ? 1f : 0.58f);
        accountHint.setVisibility(hasApi ? View.GONE : View.VISIBLE);

        if (connected) {
            String user = credentials.getUsername();
            accountStatus.setText(user.isEmpty()
                    ? "● TMDB verbunden"
                    : "● TMDB verbunden · " + user);
            accountStatus.setTextColor(COLOR_GREEN);
        } else {
            accountStatus.setText(hasApi ? "● Noch nicht verbunden" : "● Nicht verfügbar");
            accountStatus.setTextColor(hasApi ? COLOR_YELLOW : COLOR_GRAY);
        }

        usernameInput.setVisibility(connected ? View.GONE : View.VISIBLE);
        passwordInput.setVisibility(connected ? View.GONE : View.VISIBLE);
        loginButton.setVisibility(connected ? View.GONE : View.VISIBLE);
        checkButton.setVisibility(connected ? View.VISIBLE : View.GONE);
        disconnectButton.setVisibility(connected ? View.VISIBLE : View.GONE);
        removeButton.setVisibility(hasApi ? View.VISIBLE : View.GONE);

        apiTokenInput.setEnabled(!busy);
        saveApiButton.setEnabled(!busy);
        usernameInput.setEnabled(hasApi && !connected && !busy);
        passwordInput.setEnabled(hasApi && !connected && !busy);
        loginButton.setEnabled(hasApi && !connected && !busy);
        checkButton.setEnabled(connected && !busy);
        disconnectButton.setEnabled(connected && !busy);
        removeButton.setEnabled(hasApi && !busy);
    }

    private String apiTokenError(TmdbApiClient.TmdbException error) {
        if (error.getKind() == TmdbApiClient.ErrorKind.AUTHENTICATION) {
            return "API Read Access Token ungültig oder nicht autorisiert.";
        }
        return "API-Zugang konnte nicht geprüft werden: " + friendlyError(error);
    }

    private String loginError(TmdbApiClient.TmdbException error) {
        if (error.getKind() == TmdbApiClient.ErrorKind.AUTHENTICATION) {
            return "TMDB-Anmeldung fehlgeschlagen. Prüfe Benutzername, Passwort und den gespeicherten API-Zugang.";
        }
        return "TMDB-Anmeldung konnte nicht abgeschlossen werden: " + friendlyError(error);
    }

    private String friendlyError(TmdbApiClient.TmdbException error) {
        switch (error.getKind()) {
            case NETWORK:
                return "keine Verbindung zu TMDB";
            case SERVICE:
                return "TMDB ist vorübergehend nicht verfügbar";
            case AUTHENTICATION:
                return "Zugang wurde von TMDB abgelehnt";
            case RESPONSE:
            default:
                return error.getMessage() == null || error.getMessage().trim().isEmpty()
                        ? "unerwartete TMDB-Antwort"
                        : error.getMessage();
        }
    }

    private void setBusy(boolean value, String message, int color) {
        busy = value;
        refreshUi();
        showFeedback(message, color);
    }

    private void showFeedback(String message, int color) {
        feedback.setText(message);
        feedback.setTextColor(color);
        feedback.setVisibility(message == null || message.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(18), dp(20), dp(18));
        card.setBackgroundColor(COLOR_SURFACE);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, dp(14));
        card.setLayoutParams(params);
        return card;
    }

    private EditText input(String hint, boolean secret) {
        EditText field = new EditText(this);
        field.setHint(hint);
        field.setSingleLine(true);
        field.setTextColor(COLOR_TEXT);
        field.setHintTextColor(COLOR_MUTED);
        field.setFocusable(true);
        if (secret) {
            field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        } else {
            field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_NORMAL);
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
