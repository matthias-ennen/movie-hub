package de.matthiasennen.moviehub;

import org.junit.Test;
import static org.junit.Assert.*;

public final class SmbProgressStoreTest {
    @Test public void progressIsOnlyResumedAtMeaningfulValidPositions() {
        assertEquals(0, SmbProgressStore.resumablePosition(9_999, 120_000));
        assertEquals(47_532, SmbProgressStore.resumablePosition(47_532, 120_000));
        assertEquals(0, SmbProgressStore.resumablePosition(110_000, 120_000));
        assertEquals(0, SmbProgressStore.resumablePosition(47_532, -1));
        assertEquals(0, SmbProgressStore.resumablePosition(200_000, 120_000));
    }

    @Test public void identityIsStableButDistinguishesLinkAndFile() {
        String id = SmbProgressStore.mediaId("movie-99", "link1", "smb://nas/share/a.mkv");
        assertTrue(SmbProgressStore.validId(id));
        assertEquals(id, SmbProgressStore.mediaId("movie-99", "link1", "smb://nas/share/a.mkv"));
        assertNotEquals(id, SmbProgressStore.mediaId("movie-99", "link2", "smb://nas/share/a.mkv"));
        assertNotEquals(id, SmbProgressStore.mediaId("movie-99", "link1", "smb://nas/share/b.mkv"));
        assertFalse(SmbProgressStore.validScope("bad/profile"));
        assertFalse(SmbProgressStore.validId("smb://nas/share/a.mkv"));
    }

    @Test public void resumeDialogFormatsHoursMinutesSeconds() {
        assertEquals("00:47:32", SmbResumeDialog.time(2_852_000));
        assertEquals("01:50:00", SmbResumeDialog.time(6_600_000));
    }
}
