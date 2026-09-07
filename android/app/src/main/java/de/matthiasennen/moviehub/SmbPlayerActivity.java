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
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.LoadControl;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.ui.PlayerView;

import java.util.Locale;

/** Full-screen, D-Pad-capable Movie-Hub player for an authenticated SMB source. */
public final class SmbPlayerActivity extends ComponentActivity {
    public static final String EXTRA_LABEL = "movie_hub_media_label";
    public static final String EXTRA_URL = "movie_hub_smb_url";

    private static final int MIN_BUFFER_MS = 30_000;
    private static final int MAX_BUFFER_MS = 60_000;
    private static final int PLAYBACK_BUFFER_MS = 10_000;
    private static final int BACK_BUFFER_MS = 10_000;

    private SmbLocation location;
    private CredentialStore credentialStore;
    private SmbCredentials credentials;
    private ExoPlayer player;
    private PlayerView playerView;
    private TextView statusView;
    private Button credentialsButton;
    private boolean saveCredentialsWhenReady;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemUi();
        createContent(getIntent().getStringExtra(EXTRA_LABEL));
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                finish();
            }
        });

        try {
            location = SmbLocation.parse(getIntent().getStringExtra(EXTRA_URL));
        } catch (IllegalArgumentException error) {
            showStatus("Der gespeicherte SMB-Pfad ist ungültig.");
            return;
        }

        credentialStore = new CredentialStore(this);
        credentials = credentialStore.load(location.getCredentialKey());
        if (credentials == null) {
            showStatus("Für " + location.getDisplayEndpoint() + " werden lokale Zugangsdaten benötigt.");
            showCredentialsDialog(false);
        } else {
            startPlayback();
        }
    }

    private void createContent(String rawLabel) {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setControllerShowTimeoutMs(5000);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING);
        playerView.setKeepScreenOn(true);
        root.addView(playerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        TextView title = new TextView(this);
        String label = rawLabel == null || rawLabel.trim().isEmpty() ? "Netzwerkvideo" : rawLabel.trim();
        title.setText("Movie Hub · " + label);
        title.setTextColor(Color.WHITE);
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setPadding(dp(22), dp(14), dp(22), dp(14));
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.START);
        root.addView(title, titleParams);

        Button close = new Button(this);
        close.setText("× Schließen");
        close.setAllCaps(false);
        close.setOnClickListener(view -> finish());
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.END);
        closeParams.setMargins(dp(12), dp(10), dp(16), dp(12));
        root.addView(close, closeParams);

        statusView = new TextView(this);
        statusView.setTextColor(Color.WHITE);
        statusView.setTextSize(18);
        statusView.setGravity(Gravity.CENTER);
        statusView.setBackgroundColor(Color.argb(190, 9, 10, 16));
        statusView.setPadding(dp(24), dp(18), dp(24), dp(18));
        FrameLayout.LayoutParams statusParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER);
        statusParams.setMargins(dp(48), 0, dp(48), 0);
        root.addView(statusView, statusParams);

        credentialsButton = new Button(this);
        credentialsButton.setText("Netzwerkzugang ändern");
        credentialsButton.setAllCaps(false);
        credentialsButton.setOnClickListener(view -> showCredentialsDialog(true));
        FrameLayout.LayoutParams credentialsParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.START);
        credentialsParams.setMargins(dp(16), dp(12), dp(12), dp(16));
        root.addView(credentialsButton, credentialsParams);

        setContentView(root);
    }

    private void showCredentialsDialog(boolean replacing) {
        if (location == null || isFinishing()) return;
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(8), dp(24), 0);

        TextView endpoint = new TextView(this);
        endpoint.setText("Zugang für " + location.getDisplayEndpoint()
                + "\nDie Daten bleiben verschlüsselt auf diesem Gerät.");
        endpoint.setTextSize(15);
        endpoint.setPadding(0, 0, 0, dp(14));
        content.addView(endpoint);

        EditText username = new EditText(this);
        username.setHint("FRITZ!Box-Benutzername");
        username.setSingleLine(true);
        if (credentials != null) username.setText(credentials.getUsername());
        content.addView(username, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        EditText password = new EditText(this);
        password.setHint("Kennwort");
        password.setSingleLine(true);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        content.addView(password, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        CheckBox remember = new CheckBox(this);
        remember.setText("Auf diesem Gerät geschützt speichern");
        remember.setChecked(true);
        content.addView(remember);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(replacing ? "Netzwerkzugang ändern" : "Netzwerkzugang")
                .setView(content)
                .setNegativeButton("Abbrechen", (value, which) -> {
                    if (credentials == null) showStatus("Ohne Zugangsdaten kann das Netzwerkvideo nicht gestartet werden.");
                })
                .setPositiveButton("Verbinden", null)
                .create();
        dialog.setOnShowListener(value -> {
            username.requestFocus();
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> {
                String user = username.getText().toString().trim();
                if (user.isEmpty()) {
                    username.setError("Bitte FRITZ!Box-Benutzername eingeben.");
                    return;
                }
                credentials = new SmbCredentials(user, password.getText().toString());
                saveCredentialsWhenReady = remember.isChecked();
                if (!remember.isChecked()) credentialStore.remove(location.getCredentialKey());
                dialog.dismiss();
                startPlayback();
            });
        });
        dialog.show();
    }

    private void startPlayback() {
        releasePlayer();
        showStatus("Verbindung zu " + location.getDisplayEndpoint() + " wird hergestellt …");
        try {
            SmbCredentials playbackCredentials = credentials;
            ProgressiveMediaSource mediaSource = new ProgressiveMediaSource.Factory(
                    () -> new SmbDataSource(location, playbackCredentials))
                    .createMediaSource(MediaItem.fromUri(location.getUri()));
            LoadControl loadControl = new DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                            MIN_BUFFER_MS,
                            MAX_BUFFER_MS,
                            PLAYBACK_BUFFER_MS,
                            PLAYBACK_BUFFER_MS)
                    .setBackBuffer(BACK_BUFFER_MS, false)
                    .setPrioritizeTimeOverSizeThresholds(true)
                    .build();
            player = new ExoPlayer.Builder(this)
                    .setLoadControl(loadControl)
                    .build();
            playerView.setPlayer(player);
            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    if (playbackState == Player.STATE_READY) {
                        statusView.setVisibility(View.GONE);
                        if (saveCredentialsWhenReady) {
                            credentialStore.save(location.getCredentialKey(), playbackCredentials);
                            saveCredentialsWhenReady = false;
                        }
                    } else if (playbackState == Player.STATE_BUFFERING) {
                        showStatus("Netzwerkvideo wird geladen …");
                    }
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    showStatus(readableError(error));
                    credentialsButton.requestFocus();
                }
            });
            player.setMediaSource(mediaSource);
            player.prepare();
            player.play();
        } catch (Exception error) {
            showStatus(readableError(error));
            credentialsButton.requestFocus();
        }
    }

    private String readableError(Throwable error) {
        StringBuilder details = new StringBuilder();
        Throwable current = error;
        while (current != null && details.length() < 1200) {
            if (current.getMessage() != null) details.append(' ').append(current.getMessage());
            current = current.getCause();
        }
        String message = details.toString().toUpperCase(Locale.ROOT);
        if (message.contains("LOGON_FAILURE") || message.contains("ACCESS_DENIED")
                || message.contains("AUTHENTICAT")) {
            if (credentialStore != null) credentialStore.remove(location.getCredentialKey());
            return "Anmeldung an FRITZ!NAS fehlgeschlagen. Bitte Benutzername und Kennwort prüfen.";
        }
        if (message.contains("OBJECT_NAME_NOT_FOUND") || message.contains("OBJECT_PATH_NOT_FOUND")
                || message.contains("NO SUCH FILE")) {
            return "Die Videodatei wurde unter diesem SMB-Pfad nicht gefunden.";
        }
        if (message.contains("UNKNOWNHOST") || message.contains("CONNECT")
                || message.contains("TIMEOUT") || message.contains("UNREACHABLE")) {
            return "FRITZ!NAS ist nicht erreichbar. Bitte Heimnetz, FRITZ!Box und Festplatte prüfen.";
        }
        return "Das Netzwerkvideo konnte nicht abgespielt werden. Prüfe Pfad, Heimnetz und Videoformat.";
    }

    private void showStatus(String message) {
        statusView.setText(message);
        statusView.setVisibility(View.VISIBLE);
    }

    private void releasePlayer() {
        if (player != null) {
            playerView.setPlayer(null);
            player.release();
            player = null;
        }
    }

    @Override
    protected void onPause() {
        if (player != null) player.pause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
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
