interface DurableGitHubUrlOptions {
  readonly commit: string;
  readonly kind: 'blob' | 'tree';
  readonly path: string;
  readonly repository: string;
}

/** Build a GitHub artifact URL that survives branch deletion. */
export function durableGitHubUrl(options: DurableGitHubUrlOptions): string {
  if (!/^[a-f0-9]{40}$/u.test(options.commit)) {
    throw new Error('Durable GitHub URL requires a full commit SHA');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(options.repository)) {
    throw new Error('Durable GitHub URL requires an owner/repository name');
  }
  const segments = options.path.split('/');
  if (
    options.path.startsWith('/') ||
    segments.length === 0 ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('Durable GitHub URL requires a repository-relative path');
  }
  const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `https://github.com/${options.repository}/${options.kind}/${options.commit}/${encodedPath}`;
}
