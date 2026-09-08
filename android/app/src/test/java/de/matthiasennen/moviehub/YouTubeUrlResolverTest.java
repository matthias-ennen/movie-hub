package de.matthiasennen.moviehub;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public final class YouTubeUrlResolverTest {
    @Test
    public void normalizesSharedShortLinkAndDropsExtraParameters() {
        assertEquals(
                "https://www.youtube.com/watch?v=KQeEIbN296U",
                YouTubeUrlResolver.canonicalWatchUrl(
                        "https://youtu.be/KQeEIbN296U?is=Nd-UPtH_46kVwc62"));
    }

    @Test
    public void normalizesWatchLinkOnYouTubeSubdomain() {
        assertEquals(
                "https://www.youtube.com/watch?v=KQeEIbN296U",
                YouTubeUrlResolver.canonicalWatchUrl(
                        "http://m.youtube.com/watch?feature=shared&v=KQeEIbN296U"));
    }

    @Test
    public void rejectsSpoofedYouTubeDomain() {
        assertNull(YouTubeUrlResolver.canonicalWatchUrl(
                "https://youtube.com.example.org/watch?v=KQeEIbN296U"));
    }

    @Test
    public void rejectsInvalidVideoId() {
        assertNull(YouTubeUrlResolver.canonicalWatchUrl(
                "https://www.youtube.com/watch?v=not-a-video-id"));
    }

    @Test
    public void leavesNonYouTubeAndUnsupportedYouTubeLinksUnrecognized() {
        assertNull(YouTubeUrlResolver.canonicalWatchUrl("https://example.org/video"));
        assertNull(YouTubeUrlResolver.canonicalWatchUrl(
                "https://www.youtube.com/results?search_query=Movie+Hub"));
    }
}
