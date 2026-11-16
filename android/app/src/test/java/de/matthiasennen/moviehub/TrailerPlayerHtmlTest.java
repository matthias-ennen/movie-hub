package de.matthiasennen.moviehub;

import org.junit.Test;
import static org.junit.Assert.*;

public final class TrailerPlayerHtmlTest {
    @Test public void usesOneExplicitStartAndOfficialControls() {
        String html = TrailerPlayerActivity.buildPlayerHtml("example1234", true);
        assertTrue(html.contains("videoId:'example1234'"));
        assertTrue(html.contains("autoplay:0,controls:1"));
        assertTrue(html.contains("if(!p||startIssued)return;startIssued=true"));
        assertTrue(html.contains("MovieHubTrailerEvents.ready()"));
        assertTrue(html.contains("onStateChange:mhState"));
        assertTrue(html.contains("MovieHubTrailerEvents.autoplayBlocked()"));
        assertFalse(html.contains("autoplay:1"));
        assertFalse(html.contains("seekTo("));
        assertEquals(1, html.split("p\\.playVideo\\(\\)", -1).length - 1);
    }

    @Test public void preservesSoundPreference() {
        assertTrue(TrailerPlayerActivity.buildPlayerHtml("example1234", true).contains("wantSound=true"));
        assertTrue(TrailerPlayerActivity.buildPlayerHtml("example1234", false).contains("wantSound=false"));
    }
}
