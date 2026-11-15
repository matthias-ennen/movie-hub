package de.matthiasennen.moviehub;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Local-only test surface. There is no login, Firebase UI or catalog access. */
public final class AirQaActivity extends Activity {
    private static final String[][] STATIONS = {
        { "air-ard", "Das Erste", "Öffentlicher Livestream" },
        { "air-zdf", "ZDF", "Öffentlicher Livestream" },
        { "air-rtl", "RTL", "RTL+ Abo/Anmeldung" },
        { "air-pro7", "ProSieben", "Joyn Anmeldung" },
        { "air-sat1", "SAT.1", "Joyn Anmeldung" },
        { "air-vox", "VOX", "RTL+ Abo/Anmeldung" },
    };
    private TextView status;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(20), dp(24), dp(20));
        content.setBackgroundColor(Color.rgb(15, 18, 26));
        scroll.addView(content);

        TextView headline = new TextView(this);
        headline.setText("Movie Hub – AIR Gerätetest");
        headline.setTextSize(24);
        headline.setTextColor(Color.WHITE);
        content.addView(headline);

        status = new TextView(this);
        status.setText("Sender auswählen. Prüfe den konkreten Livestream und kehre mit Zurück zurück. Keine Daten werden übertragen oder gespeichert.");
        status.setTextSize(16);
        status.setTextColor(Color.WHITE);
        status.setPadding(0, dp(8), 0, dp(12));
        content.addView(status);

        Button first = null;
        for (String[] station : STATIONS) {
            Button button = new Button(this);
            button.setText(station[1] + "  ·  " + station[2]);
            button.setMinHeight(dp(52));
            button.setAllCaps(false);
            button.setFocusable(true);
            button.setFocusableInTouchMode(true);
            button.setId(View.generateViewId());
            button.setOnClickListener(view -> openStation(station));
            content.addView(button, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            if (first == null) first = button;
        }

        setContentView(scroll);
        if (first != null) first.requestFocus();
    }

    private void openStation(String[] station) {
        String target = ProviderUrlPolicy.airStationTarget(station[0]);
        boolean opened = AirStationLauncher.open(this, station[0], "WEB_LINK", "channel", target, target);
        status.setText(opened
                ? station[1] + ": Ziel geöffnet – bitte Sender und Wiedergabe tatsächlich prüfen."
                : station[1] + ": Kein passender Handler oder Ziel abgelehnt. Bitte als Fehler melden.");
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
