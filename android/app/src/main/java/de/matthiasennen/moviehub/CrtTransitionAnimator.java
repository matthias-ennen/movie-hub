package de.matthiasennen.moviehub;

import android.animation.Animator;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;

/** Shared Movie Hub CRT switch-on/switch-off animation. */
final class CrtTransitionAnimator {
    static final long PANEL_TRANSITION_MS = 650L;
    static final long LINE_TRANSITION_MS = 350L;
    static final long TOTAL_TRANSITION_MS = PANEL_TRANSITION_MS + LINE_TRANSITION_MS;

    private static final long LINE_REVEAL_MS = 150L;
    private static final long PANEL_FADE_MS = 90L;
    private static final float COLLAPSED_SCALE_Y = 0.008f;
    private static final float RECESSED_SCALE_X = 0.965f;
    private static final float GLOW_ALPHA = 0.52f;

    private CrtTransitionAnimator() {}

    static View createGlowLine(Activity activity) {
        return createPhosphorLine(activity, dp(activity, 12), Color.rgb(86, 181, 238));
    }

    static View createCoreLine(Activity activity) {
        return createPhosphorLine(
                activity,
                Math.max(1, dp(activity, 2)),
                Color.rgb(225, 247, 255));
    }

    static FrameLayout.LayoutParams glowLineParams(Activity activity) {
        return lineParams(activity, dp(activity, 12));
    }

    static FrameLayout.LayoutParams coreLineParams(Activity activity) {
        return lineParams(activity, Math.max(1, dp(activity, 2)));
    }

    static void prepareSwitchOn(View panel, View glowLine, View coreLine) {
        panel.setScaleX(RECESSED_SCALE_X);
        panel.setScaleY(COLLAPSED_SCALE_Y);
        panel.setAlpha(0f);
        glowLine.setScaleX(0f);
        glowLine.setAlpha(0f);
        coreLine.setScaleX(0f);
        coreLine.setAlpha(0f);
    }

    static Animator createSwitchOn(View panel, View glowLine, View coreLine) {
        // Exact temporal inverse of switch-off: first the phosphor line grows,
        // then the complete surface opens out of it.
        ObjectAnimator coreGrow = ObjectAnimator.ofFloat(coreLine, View.SCALE_X, 0f, 1f);
        coreGrow.setDuration(LINE_TRANSITION_MS);
        coreGrow.setInterpolator(new DecelerateInterpolator(1.2f));
        ObjectAnimator coreAppear = ObjectAnimator.ofFloat(coreLine, View.ALPHA, 0f, 1f, 1f);
        coreAppear.setDuration(LINE_TRANSITION_MS);

        ObjectAnimator glowGrow = ObjectAnimator.ofFloat(glowLine, View.SCALE_X, 0f, 1f);
        glowGrow.setDuration(LINE_TRANSITION_MS);
        glowGrow.setInterpolator(new DecelerateInterpolator(1.2f));
        ObjectAnimator glowAppear = ObjectAnimator.ofFloat(
                glowLine, View.ALPHA, 0f, 0.45f, GLOW_ALPHA);
        glowAppear.setDuration(LINE_TRANSITION_MS);

        ObjectAnimator panelAppear = ObjectAnimator.ofFloat(panel, View.ALPHA, 0f, 1f);
        panelAppear.setStartDelay(LINE_TRANSITION_MS - PANEL_FADE_MS);
        panelAppear.setDuration(PANEL_FADE_MS);

        AnimatorSet lineExpand = new AnimatorSet();
        lineExpand.playTogether(coreGrow, coreAppear, glowGrow, glowAppear, panelAppear);

        DecelerateInterpolator expandInterpolator = new DecelerateInterpolator(1.35f);
        ObjectAnimator expandY = ObjectAnimator.ofFloat(
                panel, View.SCALE_Y, COLLAPSED_SCALE_Y, 1f);
        expandY.setDuration(PANEL_TRANSITION_MS);
        expandY.setInterpolator(expandInterpolator);
        ObjectAnimator advanceX = ObjectAnimator.ofFloat(
                panel, View.SCALE_X, RECESSED_SCALE_X, 1f);
        advanceX.setDuration(PANEL_TRANSITION_MS);
        advanceX.setInterpolator(expandInterpolator);

        ObjectAnimator coreDisappear = ObjectAnimator.ofFloat(coreLine, View.ALPHA, 1f, 0f);
        coreDisappear.setDuration(LINE_REVEAL_MS);
        ObjectAnimator glowDisappear = ObjectAnimator.ofFloat(
                glowLine, View.ALPHA, GLOW_ALPHA, 0f);
        glowDisappear.setDuration(LINE_REVEAL_MS);

        AnimatorSet panelExpand = new AnimatorSet();
        panelExpand.playTogether(expandY, advanceX, coreDisappear, glowDisappear);

        AnimatorSet switchOn = new AnimatorSet();
        switchOn.playSequentially(lineExpand, panelExpand);
        return switchOn;
    }

    static Animator createSwitchOff(View panel, View glowLine, View coreLine) {
        panel.setScaleX(1f);
        panel.setScaleY(1f);
        panel.setAlpha(1f);
        glowLine.setScaleX(1f);
        glowLine.setAlpha(0f);
        coreLine.setScaleX(1f);
        coreLine.setAlpha(0f);

        AccelerateInterpolator collapseInterpolator = new AccelerateInterpolator(1.35f);

        ObjectAnimator collapseY = ObjectAnimator.ofFloat(
                panel, View.SCALE_Y, 1f, COLLAPSED_SCALE_Y);
        collapseY.setDuration(PANEL_TRANSITION_MS);
        collapseY.setInterpolator(collapseInterpolator);

        ObjectAnimator recedeX = ObjectAnimator.ofFloat(
                panel, View.SCALE_X, 1f, RECESSED_SCALE_X);
        recedeX.setDuration(PANEL_TRANSITION_MS);
        recedeX.setInterpolator(collapseInterpolator);

        ObjectAnimator coreAppear = ObjectAnimator.ofFloat(coreLine, View.ALPHA, 0f, 1f);
        coreAppear.setStartDelay(PANEL_TRANSITION_MS - LINE_REVEAL_MS);
        coreAppear.setDuration(LINE_REVEAL_MS);

        ObjectAnimator glowAppear = ObjectAnimator.ofFloat(
                glowLine, View.ALPHA, 0f, GLOW_ALPHA);
        glowAppear.setStartDelay(PANEL_TRANSITION_MS - LINE_REVEAL_MS);
        glowAppear.setDuration(LINE_REVEAL_MS);

        AnimatorSet panelCollapse = new AnimatorSet();
        panelCollapse.playTogether(collapseY, recedeX, coreAppear, glowAppear);

        ObjectAnimator panelFade = ObjectAnimator.ofFloat(panel, View.ALPHA, 1f, 0f);
        panelFade.setDuration(PANEL_FADE_MS);

        ObjectAnimator coreShrink = ObjectAnimator.ofFloat(coreLine, View.SCALE_X, 1f, 0f);
        coreShrink.setDuration(LINE_TRANSITION_MS);
        coreShrink.setInterpolator(new AccelerateInterpolator(1.2f));
        ObjectAnimator coreFade = ObjectAnimator.ofFloat(coreLine, View.ALPHA, 1f, 1f, 0f);
        coreFade.setDuration(LINE_TRANSITION_MS);

        ObjectAnimator glowShrink = ObjectAnimator.ofFloat(glowLine, View.SCALE_X, 1f, 0f);
        glowShrink.setDuration(LINE_TRANSITION_MS);
        glowShrink.setInterpolator(new AccelerateInterpolator(1.2f));
        ObjectAnimator glowFade = ObjectAnimator.ofFloat(
                glowLine, View.ALPHA, GLOW_ALPHA, 0.45f, 0f);
        glowFade.setDuration(LINE_TRANSITION_MS);

        AnimatorSet lineCollapse = new AnimatorSet();
        lineCollapse.playTogether(panelFade, coreShrink, coreFade, glowShrink, glowFade);

        AnimatorSet switchOff = new AnimatorSet();
        switchOff.playSequentially(panelCollapse, lineCollapse);
        return switchOff;
    }

    private static View createPhosphorLine(Activity activity, int height, int color) {
        View line = new View(activity);
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(Math.max(1f, height / 2f));
        line.setBackground(background);
        line.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        return line;
    }

    private static FrameLayout.LayoutParams lineParams(Activity activity, int height) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                height,
                Gravity.CENTER);
        int sideMargin = Math.round(
                activity.getResources().getDisplayMetrics().widthPixels * 0.11f);
        params.leftMargin = sideMargin;
        params.rightMargin = sideMargin;
        return params;
    }

    private static int dp(Activity activity, int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
