package de.matthiasennen.moviehub;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
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
    private static final int MOVIE_HUB_BLUE = Color.rgb(141, 167, 255);

    private SmbLocation location;
    private CredentialStore credentialStore;
    private NetworkConnectionStore connectionStore;
    private SmbConnection connection;
    private SmbCredentials credentials;
    private ExoPlayer player;
    private PlayerView playerView;
    private TextView statusView;
    private TextView titleView;
    private Button closeButton;

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
        connectionStore = new NetworkConnectionStore(this);
        SmbCredentials persistentCredentials = credentialStore.load(location.getCredentialKey());
        connection = connectionStore.ensure(location, persistentCredentials != null);
        credentials = loadCredentials();

        if (!connection.isEnabled()) {
            showStatus("Das Netzlaufwerk " + location.getDisplayEndpoint()
                    + " ist getrennt. Bitte unter Einstellungen → Netzlaufwerke verbinden.");
        } else if (credentials == null) {
            showStatus("Für " + location.getDisplayEndpoint()
                    + " fehlen lokale Zugangsdaten. Bitte unter Einstellungen → Netzlaufwerke einrichten.");
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
        playerView.setControllerVisibilityListener(new PlayerView.ControllerVisibilityListener() {
            @Override
            public void onVisibilityChanged(int visibility) {
                setChromeVisibility(visibility);
            }
        });
        root.addView(playerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        titleView = new TextView(this);
        String label = rawLabel == null || rawLabel.trim().isEmpty() ? "Netzwerkvideo" : rawLabel.trim();
        SpannableString titleText = new SpannableString("Movie Hub · " + label);
        titleText.setSpan(new ForegroundColorSpan(MOVIE_HUB_BLUE), 6, 9,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        titleView.setText(titleText);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(18);
        titleView.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        titleView.setPadding(dp(22), dp(14), dp(22), dp(14));
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.START);
        root.addView(titleView, titleParams);

        closeButton = new Button(this);
        closeButton.setText("×");
        closeButton.setTextColor(Color.WHITE);
        closeButton.setTextSize(28);
        closeButton.setAllCaps(false);
        closeButton.setGravity(Gravity.CENTER);
        closeButton.setMinWidth(0);
        closeButton.setMinHeight(0);
        closeButton.setPadding(0, 0, 0, dp(3));
        closeButton.setBackground(makeCloseBackground(false));
        closeButton.setOnFocusChangeListener((view, focused) ->
                view.setBackground(makeCloseBackground(focused)));
        closeButton.setOnClickListener(view -> finish());
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(
                dp(48), dp(48), Gravity.TOP | Gravity.END);
        closeParams.setMargins(dp(12), dp(12), dp(18), dp(12));
        root.addView(closeButton, closeParams);

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

        setContentView(root);
    }

    private GradientDrawable makeCloseBackground(boolean focused) {
        GradientDrawable background = new GradientDrawable();
        background.setShape(GradientDrawable.OVAL);
        background.setColor(Color.argb(focused ? 100 : 70, 255, 255, 255));
        background.setStroke(dp(focused ? 3 : 1),
                focused ? Color.WHITE : Color.argb(120, 255, 255, 255));
        return background;
    }

    private void setChromeVisibility(int visibility) {
        int target = visibility == View.VISIBLE ? View.VISIBLE : View.GONE;
        if (titleView != null) titleView.setVisibility(target);
        if (closeButton != null) closeButton.setVisibility(target);
    }

    private SmbCredentials loadCredentials() {
        if (connection != null && !connection.usesPersistentCredentials()) {
            return SessionCredentialStore.load(location.getCredentialKey());
        }
        return credentialStore.load(location.getCredentialKey());
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
                    } else if (playbackState == Player.STATE_BUFFERING) {
                        showStatus("Netzwerkvideo wird geladen …");
                    }
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    showStatus(readableError(error));
                }
            });
            player.setMediaSource(mediaSource);
            player.prepare();
            player.play();
        } catch (Exception error) {
            showStatus(readableError(error));
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
            SessionCredentialStore.remove(location.getCredentialKey());
            return "Anmeldung an FRITZ!NAS fehlgeschlagen. Bitte Zugangsdaten unter Einstellungen → Netzlaufwerke prüfen.";
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
