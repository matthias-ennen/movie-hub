package de.matthiasennen.moviehub;

import static org.junit.Assert.*;
import org.junit.Test;

public final class AirStationRoutePolicyTest {
    @Test public void acceptsOnlySameExactStationInChannelWebMode() {
        String[] ids = {"air-ard", "air-zdf", "air-rtl", "air-pro7", "air-sat1", "air-vox", "air-arte", "air-3sat", "air-zdfneo", "air-zdfinfo", "air-einsfestival", "air-kabeleins", "air-rtl2", "air-superrtl", "air-tele5", "air-prosieben_maxx", "air-sat1gold", "air-rtlnitro"};
        for (String id : ids) {
            String target = ProviderUrlPolicy.airStationTarget(id);
            assertNotNull(target);
            assertTrue(AirStationRoutePolicy.isAllowed(id, "WEB_LINK", "channel", target, target));
            assertFalse(AirStationRoutePolicy.isAllowed(id, "APP_DEEP_LINK", "channel", target, target));
            assertFalse(AirStationRoutePolicy.isAllowed(id, "WEB_LINK", "title", target, target));
            assertFalse(AirStationRoutePolicy.isAllowed(id, "WEB_LINK", "channel", target, target + "?other=1"));
            for (String other : ids) {
                if (!other.equals(id)) {
                    String otherTarget = ProviderUrlPolicy.airStationTarget(other);
                    assertFalse(AirStationRoutePolicy.isAllowed(id, "WEB_LINK", "channel", otherTarget, otherTarget));
                }
            }
        }
        assertFalse(AirStationRoutePolicy.isAllowed("air-unknown", "WEB_LINK", "channel", null, null));
        assertFalse(AirStationRoutePolicy.isAllowed("joyn", "WEB_LINK", "channel",
            "https://www.joyn.de/live-tv/prosieben", "https://www.joyn.de/live-tv/prosieben"));
    }
}
