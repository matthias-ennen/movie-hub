package de.matthiasennen.moviehub;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;

/** Owns the shared CRT transition lifecycle for a full-screen player Activity. */
final class PlayerCrtTransition {
    private final FrameLayout host;
    private final FrameLayout playerSurface;
    private final View glowLine;
    private final View coreLine;
    private final Runnable finishActivity;

    private Animator animator;
    private Runnable whenVisible;
    private boolean entering = true;
    private boolean closeRequested;
    private boolean destroyed;

    private PlayerCrtTransition(
            FrameLayout host,
            FrameLayout playerSurface,
            View glowLine,
            View coreLine,
            Runnable finishActivity) {
        this.host = host;
        this.playerSurface = playerSurface;
        this.glowLine = glowLine;
        this.coreLine = coreLine;
        this.finishActivity = finishActivity;
    }

    static PlayerCrtTransition install(Activity activity, View content, Runnable finishActivity) {
        activity.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);

        FrameLayout host = new FrameLayout(activity);
        host.setBackgroundColor(Color.TRANSPARENT);
        host.setFitsSystemWindows(false);

        FrameLayout playerSurface = new FrameLayout(activity);
        playerSurface.setBackgroundColor(Color.BLACK);
        playerSurface.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        playerSurface.addView(content, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        host.addView(playerSurface, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        View glowLine = CrtTransitionAnimator.createGlowLine(activity);
        View coreLine = CrtTransitionAnimator.createCoreLine(activity);
        host.addView(glowLine, CrtTransitionAnimator.glowLineParams(activity));
        host.addView(coreLine, CrtTransitionAnimator.coreLineParams(activity));

        PlayerCrtTransition transition = new PlayerCrtTransition(
                host, playerSurface, glowLine, coreLine, finishActivity);
        CrtTransitionAnimator.prepareSwitchOn(playerSurface, glowLine, coreLine);
        activity.setContentView(host);
        host.post(transition::startSwitchOn);
        return transition;
    }

    void requestClose() {
        if (destroyed || closeRequested) return;
        closeRequested = true;
        whenVisible = null;
        blockFurtherInput();
        if (!entering) startSwitchOff();
    }

    void runWhenVisible(Runnable action) {
        if (destroyed || closeRequested) return;
        if (entering) {
            whenVisible = action;
        } else {
            action.run();
        }
    }

    void destroy() {
        destroyed = true;
        whenVisible = null;
        if (animator != null) {
            animator.removeAllListeners();
            animator.cancel();
            animator = null;
        }
    }

    private void startSwitchOn() {
        if (destroyed || !host.isAttachedToWindow()) return;
        animator = CrtTransitionAnimator.createSwitchOn(playerSurface, glowLine, coreLine);
        animator.addListener(new AnimatorListenerAdapter() {
            private boolean handled;

            @Override
            public void onAnimationEnd(Animator animation) {
                if (handled || destroyed) return;
                handled = true;
                entering = false;
                animator = null;
                if (closeRequested) {
                    startSwitchOff();
                } else if (whenVisible != null) {
                    Runnable action = whenVisible;
                    whenVisible = null;
                    action.run();
                }
            }
        });
        animator.start();
    }

    private void startSwitchOff() {
        if (destroyed || !host.isAttachedToWindow()) {
            finishOnce();
            return;
        }
        animator = CrtTransitionAnimator.createSwitchOff(playerSurface, glowLine, coreLine);
        animator.addListener(new AnimatorListenerAdapter() {
            private boolean handled;

            @Override
            public void onAnimationEnd(Animator animation) {
                complete();
            }

            @Override
            public void onAnimationCancel(Animator animation) {
                complete();
            }

            private void complete() {
                if (handled || destroyed) return;
                handled = true;
                animator = null;
                finishOnce();
            }
        });
        animator.start();
    }

    private void blockFurtherInput() {
        host.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        host.setFocusable(true);
        host.setFocusableInTouchMode(true);
        host.setClickable(true);
        host.requestFocus();
    }

    private void finishOnce() {
        if (destroyed) return;
        destroyed = true;
        finishActivity.run();
    }
}
