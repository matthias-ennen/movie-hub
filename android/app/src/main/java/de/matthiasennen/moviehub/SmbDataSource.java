package de.matthiasennen.moviehub;

import android.net.Uri;

import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.datasource.BaseDataSource;
import androidx.media3.datasource.DataSpec;

import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.Share;

import java.io.IOException;
import java.util.EnumSet;

/** Random-access Media3 byte source backed by one SMB2/3 file handle. */
final class SmbDataSource extends BaseDataSource {
    private static final int MAX_READ_SIZE = 256 * 1024;

    private final SmbLocation location;
    private final SmbCredentials credentials;
    private SMBClient client;
    private Connection connection;
    private DiskShare diskShare;
    private com.hierynomus.smbj.share.File file;
    private long readPosition;
    private long bytesRemaining;
    private boolean opened;

    SmbDataSource(SmbLocation location, SmbCredentials credentials) {
        super(true);
        this.location = location;
        this.credentials = credentials;
    }

    @Override
    public long open(DataSpec dataSpec) throws IOException {
        transferInitializing(dataSpec);
        try {
            client = new SMBClient();
            connection = client.connect(location.getHost(), location.getPort());
            Session session = connection.authenticate(new AuthenticationContext(
                    credentials.getUsername(), credentials.getPasswordChars(), ""));
            Share share = session.connectShare(location.getShare());
            if (!(share instanceof DiskShare)) {
                closeResources();
                throw new IOException("Die SMB-Freigabe ist keine Dateifreigabe.");
            }
            diskShare = (DiskShare) share;
            file = diskShare.openFile(
                    location.getPath(),
                    EnumSet.of(AccessMask.GENERIC_READ),
                    null,
                    SMB2ShareAccess.ALL,
                    SMB2CreateDisposition.FILE_OPEN,
                    null);

            long fileLength = file.getLength();
            if (dataSpec.position < 0 || dataSpec.position > fileLength) {
                closeResources();
                throw new IOException("Die angeforderte Position liegt außerhalb der Datei.");
            }
            readPosition = dataSpec.position;
            long available = fileLength - readPosition;
            bytesRemaining = dataSpec.length == C.LENGTH_UNSET
                    ? available
                    : Math.min(dataSpec.length, available);
            opened = true;
            transferStarted(dataSpec);
            return bytesRemaining;
        } catch (IOException error) {
            closeResources();
            throw error;
        } catch (Exception error) {
            closeResources();
            throw new IOException("SMB-Datei konnte nicht geöffnet werden.", error);
        }
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        if (length == 0) return 0;
        if (bytesRemaining == 0) return C.RESULT_END_OF_INPUT;
        int requested = (int) Math.min(Math.min((long) length, bytesRemaining), MAX_READ_SIZE);
        try {
            int read = file.read(buffer, readPosition, offset, requested);
            if (read == -1) return C.RESULT_END_OF_INPUT;
            readPosition += read;
            bytesRemaining -= read;
            bytesTransferred(read);
            return read;
        } catch (Exception error) {
            throw new IOException("SMB-Datei konnte nicht gelesen werden.", error);
        }
    }

    @Nullable
    @Override
    public Uri getUri() {
        return location.getUri();
    }

    @Override
    public void close() {
        boolean wasOpened = opened;
        opened = false;
        closeResources();
        if (wasOpened) transferEnded();
    }

    private void closeResources() {
        closeQuietly(file);
        file = null;
        closeQuietly(diskShare);
        diskShare = null;
        closeQuietly(connection);
        connection = null;
        closeQuietly(client);
        client = null;
    }

    private void closeQuietly(AutoCloseable closeable) {
        if (closeable == null) return;
        try {
            closeable.close();
        } catch (Exception ignored) {
            // A failed network close must not crash or hide the player result.
        }
    }
}
