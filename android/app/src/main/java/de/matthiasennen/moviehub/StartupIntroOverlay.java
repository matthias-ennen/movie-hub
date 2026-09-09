package de.matthiasennen.moviehub;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.app.Activity;
import android.app.Application;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AccelerateInterpolator;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Shows the native Movie Hub startup branding exactly once per Android process.
 * The hosted WebView keeps loading underneath while this overlay is visible.
 */
final class StartupIntroOverlay {
    static final long LOGO_HOLD_MS = 5_000L;
    static final long CRT_COLLAPSE_MS = 650L;
    static final long CRT_LINE_MS = 350L;

    private static boolean consumed;

    private StartupIntroOverlay() {}

    static void register(Application application) {
        application.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            @Override
            public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                if (!consumed && activity instanceof MainActivity) {
                    consumed = true;
                    attach(activity);
                }
            }

            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityResumed(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        });
    }

    private static void attach(Activity activity) {
        ViewGroup content = activity.findViewById(android.R.id.content);
        if (content == null) {
            return;
        }

        FrameLayout overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(Color.TRANSPARENT);
        overlay.setFocusable(true);
        overlay.setFocusableInTouchMode(true);
        overlay.setClickable(true);

        FrameLayout collapseLayer = new FrameLayout(activity);
        collapseLayer.setBackgroundColor(Color.BLACK);
        collapseLayer.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        overlay.addView(collapseLayer, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout logo = createLogo(activity);
        FrameLayout.LayoutParams logoParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER);
        collapseLayer.addView(logo, logoParams);

        View glowLine = createPhosphorLine(activity, dp(activity, 12), Color.rgb(86, 181, 238));
        glowLine.setAlpha(0f);
        glowLine.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        overlay.addView(glowLine, lineParams(activity, dp(activity, 12)));

        View coreLine = createPhosphorLine(activity, Math.max(1, dp(activity, 2)), Color.rgb(225, 247, 255));
        coreLine.setAlpha(0f);
        coreLine.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        overlay.addView(coreLine, lineParams(activity, Math.max(1, dp(activity, 2))));

        content.addView(overlay, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        overlay.bringToFront();
        overlay.requestFocus();

        overlay.postDelayed(() -> {
            if (!overlay.isAttachedToWindow() || activity.isFinishing()) {
                return;
            }
            startCrtShutdown(activity, content, overlay, collapseLayer, glowLine, coreLine);
        }, LOGO_HOLD_MS);
    }

    private static LinearLayout createLogo(Activity activity) {
        LinearLayout logo = new LinearLayout(activity);
        logo.setOrientation(LinearLayout.HORIZONTAL);
        logo.setGravity(Gravity.CENTER);

        float density = activity.getResources().getDisplayMetrics().density;
        float widthDp = activity.getResources().getDisplayMetrics().widthPixels / density;
        float textSizeSp = Math.max(34f, Math.min(66f, widthDp * 0.065f));

        TextView movie = createLogoWord(activity, "MOVIE", Color.rgb(241, 246, 255), textSizeSp);
        TextView hub = createLogoWord(activity, "HUB", Color.rgb(75, 181, 241), textSizeSp);

        logo.addView(movie);
        LinearLayout.LayoutParams hubParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        hubParams.leftMargin = dp(activity, 12);
        logo.addView(hub, hubParams);
        return logo;
    }

    private static TextView createLogoWord(Activity activity, String word, int color, float textSizeSp) {
        TextView text = new TextView(activity);
        text.setText(word);
        text.setTextColor(color);
        text.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp);
        text.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        text.setLetterSpacing(0.12f);
        text.setIncludeFontPadding(false);
        text.setGravity(Gravity.CENTER);
        return text;
    }

    private static View createPhosphorLine(Activity activity, int height, int color) {
        View line = new View(activity);
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(Math.max(1f, height / 2f));
        line.setBackground(background);
        return line;
    }

    private static FrameLayout.LayoutParams lineParams(Activity activity, int height) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                height,
                Gravity.CENTER);
        int sideMargin = Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.11f);
        params.leftMargin = sideMargin;
        params.rightMargin = sideMargin;
        return params;
    }

    private static void startCrtShutdown(
            Activity activity,
            ViewGroup content,
            FrameLayout overlay,
            FrameLayout collapseLayer,
            View glowLine,
            View coreLine) {

        AccelerateInterpolator collapseInterpolator = new AccelerateInterpolator(1.35f);

        ObjectAnimator collapseY = ObjectAnimator.ofFloat(collapseLayer, View.SCALE_Y, 1f, 0.008f);
        collapseY.setDuration(CRT_COLLAPSE_MS);
        collapseY.setInterpolator(collapseInterpolator);

        ObjectAnimator recedeX = ObjectAnimator.ofFloat(collapseLayer, View.SCALE_X, 1f, 0.965f);
        recedeX.setDuration(CRT_COLLAPSE_MS);
        recedeX.setInterpolator(collapseInterpolator);

        ObjectAnimator coreAppear = ObjectAnimator.ofFloat(coreLine, View.ALPHA, 0f, 1f);
        coreAppear.setStartDelay(500L);
        coreAppear.setDuration(150L);

        ObjectAnimator glowAppear = ObjectAnimator.ofFloat(glowLine, View.ALPHA, 0f, 0.52f);
        glowAppear.setStartDelay(500L);
        glowAppear.setDuration(150L);

        AnimatorSet collapse = new AnimatorSet();
        collapse.playTogether(collapseY, recedeX, coreAppear, glowAppear);

        ObjectAnimator panelFade = ObjectAnimator.ofFloat(collapseLayer, View.ALPHA, 1f, 0f);
        panelFade.setDuration(90L);

        ObjectAnimator coreShrink = ObjectAnimator.ofFloat(coreLine, View.SCALE_X, 1f, 0f);
        coreShrink.setDuration(CRT_LINE_MS);
        coreShrink.setInterpolator(new AccelerateInterpolator(1.2f));
        ObjectAnimator coreFade = ObjectAnimator.ofFloat(coreLine, View.ALPHA, 1f, 1f, 0f);
        coreFade.setDuration(CRT_LINE_MS);

        ObjectAnimator glowShrink = ObjectAnimator.ofFloat(glowLine, View.SCALE_X, 1f, 0f);
        glowShrink.setDuration(CRT_LINE_MS);
        glowShrink.setInterpolator(new AccelerateInterpolator(1.2f));
        ObjectAnimator glowFade = ObjectAnimator.ofFloat(glowLine, View.ALPHA, 0.52f, 0.45f, 0f);
        glowFade.setDuration(CRT_LINE_MS);

        AnimatorSet lineCollapse = new AnimatorSet();
        lineCollapse.playTogether(panelFade, coreShrink, coreFade, glowShrink, glowFade);

        AnimatorSet shutdown = new AnimatorSet();
        shutdown.playSequentially(collapse, lineCollapse);
        shutdown.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                removeOverlay(content, overlay);
                requestWebViewFocus(content);
            }

            @Override
            public void onAnimationCancel(Animator animation) {
                removeOverlay(content, overlay);
                requestWebViewFocus(content);
            }
        });
        shutdown.start();
    }

    private static void removeOverlay(ViewGroup content, View overlay) {
        if (overlay.getParent() == content) {
            content.removeView(overlay);
        }
    }

    private static boolean requestWebViewFocus(View view) {
        if (view instanceof WebView && view.getVisibility() == View.VISIBLE) {
            return view.requestFocus();
        }
        if (!(view instanceof ViewGroup)) {
            return false;
        }
        ViewGroup group = (ViewGroup) view;
        for (int i = 0; i < group.getChildCount(); i++) {
            if (requestWebViewFocus(group.getChildAt(i))) {
                return true;
            }
        }
        return false;
    }

    private static int dp(Activity activity, int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
