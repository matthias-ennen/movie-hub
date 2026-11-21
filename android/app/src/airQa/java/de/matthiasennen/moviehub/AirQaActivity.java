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
        { "air-arte", "ARTE", "Öffentlicher Livestream" },
        { "air-3sat", "3sat", "Öffentlicher Livestream" },
        { "air-zdfneo", "ZDFneo", "Öffentlicher Livestream" },
        { "air-zdfinfo", "ZDFinfo", "Öffentlicher Livestream" },
        { "air-einsfestival", "ONE", "Öffentlicher Livestream" },
        { "air-kabeleins", "Kabel Eins", "Joyn Anmeldung ggf. erforderlich" },
        { "air-rtl2", "RTLZWEI", "RTL+ Abo/Anmeldung" },
        { "air-superrtl", "SUPER RTL", "RTL+ Abo/Anmeldung" },
        { "air-tele5", "TELE 5", "Joyn Anmeldung ggf. erforderlich" },
        { "air-prosieben_maxx", "ProSieben MAXX", "Joyn Anmeldung ggf. erforderlich" },
        { "air-sat1gold", "SAT.1 GOLD", "Joyn Anmeldung ggf. erforderlich" },
        { "air-rtlnitro", "NITRO", "RTL+ Abo/Anmeldung" },
        { "air-comedy_central", "Comedy Central", "Joyn Anmeldung ggf. erforderlich" },
        { "air-sixx", "sixx", "Joyn Anmeldung ggf. erforderlich" },
        { "air-dmax", "DMAX", "Joyn Anmeldung ggf. erforderlich" },
        { "air-tlc", "TLC", "Joyn Anmeldung ggf. erforderlich" },
        { "air-brsued", "BR Süd", "Öffentlicher Livestream" },
        { "air-hr", "hr-fernsehen", "Öffentlicher Livestream" },
        { "air-n3_hamburg", "NDR Hamburg", "Öffentlicher Livestream" },
        { "air-wdr_koeln", "WDR Köln", "Öffentlicher Livestream" },
        { "air-kika", "KiKA", "Öffentlicher Livestream" },
        { "air-phoenix", "phoenix", "Öffentlicher Livestream" },
        { "air-n24", "WELT", "Öffentlicher Livestream" },
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
        headline.setText("Movie Hub – AIR Gerätetest (" + STATIONS.length + " Sender)");
        headline.setTextSize(24);
        headline.setTextColor(Color.WHITE);
        content.addView(headline);

        status = new TextView(this);
        status.setText("Neue Sender auswählen. Prüfe den konkreten Livestream und kehre mit Zurück zurück. Keine Daten werden übertragen oder gespeichert.");
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
