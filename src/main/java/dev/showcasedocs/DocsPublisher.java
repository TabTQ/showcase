package dev.showcasedocs;

import dev.showcasedocs.github.GitHubSync;
import org.springframework.stereotype.Service;

/**
 * The one place that says "the public site may have changed". After any change that affects what is public, the service calls
 * {@link #publish()}, which queues a GitHub sync. The sync itself runs in the background, so a GitHub problem never fails or
 * delays the change that was just saved.
 */
@Service
public class DocsPublisher {

    private final GitHubSync github;

    public DocsPublisher(GitHubSync github) {
        this.github = github;
    }

    /** Queues a sync. Never throws. @return true when the request was queued */
    public boolean publish() {
        github.requestSync();
        return true;
    }
}
