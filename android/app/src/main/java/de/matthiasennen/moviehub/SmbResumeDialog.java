package de.matthiasennen.moviehub;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import org.json.JSONObject;
import java.util.Locale;

/** Native, focusable Movie Hub resume prompt inside the already-open CRT surface. */
final class SmbResumeDialog {
    interface Selection { void accept(long position); }
    private final Context context;
    private final int surface, text, muted, control, accent, focus;

    SmbResumeDialog(Context context, String palette) {
        this.context = context;
        JSONObject colors;
        try { colors = new JSONObject(palette); } catch (Exception ignored) { colors = new JSONObject(); }
        surface = color(colors, "surface", "#151923");
        text = color(colors, "text", "#FFFFFF");
        muted = color(colors, "muted", "#C9CFDA");
        control = color(colors, "control", "#303847");
        accent = color(colors, "accent", "#8DA7FF");
        focus = color(colors, "focus", "#FFFFFF");
    }

    void show(FrameLayout root, SmbProgressStore.Record record, Selection selection) {
        FrameLayout overlay = new FrameLayout(context);
        overlay.setBackgroundColor(Color.argb(180, 0, 0, 0));
        overlay.setClickable(true);
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(24), dp(20), dp(24), dp(20));
        card.setBackground(rounded(surface, dp(16), 0, 0));
        int maxWidth = context.getResources().getDisplayMetrics().widthPixels - dp(32);
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        overlay.addView(card, new FrameLayout.LayoutParams(Math.min(dp(470), maxWidth), -2, Gravity.CENTER));
        TextView heading = label("Wiedergabe fortsetzen?", 22, text);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        card.addView(heading);
        TextView detail = label("Zuletzt unterbrochen bei " + time(record.position), 16, muted);
        add(card, detail, 8);
        ProgressBar progress = new ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(1000);
        progress.setProgress((int) (record.position * 1000 / record.duration));
        progress.setProgressTintList(ColorStateList.valueOf(accent));
        progress.setProgressBackgroundTintList(ColorStateList.valueOf(control));
        add(card, progress, 12);
        TextView times = label(time(record.position) + "  /  " + time(record.duration), 14, muted);
        add(card, times, 2);
        Button resume = button("Fortsetzen", accent, contrastText(accent));
        Button restart = button("Von Anfang an abspielen", control, text);
        add(card, resume, 14);
        add(card, restart, 6);
        resume.setId(View.generateViewId()); restart.setId(View.generateViewId());
        resume.setNextFocusDownId(restart.getId()); restart.setNextFocusUpId(resume.getId());
        resume.setNextFocusUpId(resume.getId()); restart.setNextFocusDownId(restart.getId());
        resume.setNextFocusLeftId(resume.getId()); resume.setNextFocusRightId(resume.getId());
        restart.setNextFocusLeftId(restart.getId()); restart.setNextFocusRightId(restart.getId());
        resume.setOnClickListener(view -> { root.removeView(overlay); selection.accept(record.position); });
        restart.setOnClickListener(view -> { root.removeView(overlay); selection.accept(0); });
        resume.requestFocus();
        resume.post(resume::requestFocus);
    }

    private TextView label(String value, int size, int color) {
        TextView view = new TextView(context); view.setText(value); view.setTextSize(size); view.setTextColor(color); return view;
    }
    private void add(LinearLayout layout, View view, int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(margin); layout.addView(view, params);
    }
    private Button button(String label, int background, int foreground) {
        Button button = new Button(context);
        button.setText(label); button.setAllCaps(false); button.setTextColor(foreground);
        button.setTextSize(16); button.setMinHeight(dp(48)); button.setFocusableInTouchMode(true);
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[]{android.R.attr.state_focused}, rounded(background, dp(12), dp(3), focus));
        states.addState(new int[]{}, rounded(background, dp(12), 0, 0));
        button.setBackground(states);
        button.setBackgroundTintList(null);
        button.setStateListAnimator(null);
        return button;
    }
    private GradientDrawable rounded(int color, int radius, int stroke, int border) {
        GradientDrawable shape = new GradientDrawable(); shape.setColor(color); shape.setCornerRadius(radius);
        if (stroke > 0) shape.setStroke(stroke, border); return shape;
    }
    private static int color(JSONObject json, String key, String fallback) {
        String raw = json.optString(key, fallback);
        try { return raw.matches("#[a-fA-F0-9]{6}") ? Color.parseColor(raw) : Color.parseColor(fallback); }
        catch (Exception ignored) { return Color.parseColor(fallback); }
    }
    private static int contrastText(int background) {
        return (Color.red(background) * 299 + Color.green(background) * 587 + Color.blue(background) * 114) / 1000 > 150 ? Color.BLACK : Color.WHITE;
    }
    static String time(long ms) {
        long seconds = Math.max(0, ms / 1000);
        return String.format(Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60);
    }
    private int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }
}
