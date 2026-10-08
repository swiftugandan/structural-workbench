# Preview 9 revalidation baseline

Executed the complete software-GPU browser suite against source 80bfff29cba623dd2c8e762f0d2226f0983c6e0ce625f35a96a8b8acb2b60648, build ad35fc6c7ed41cd64e65120a0feea1f6c61ed5f955d62548918a683f3e3cdaff.

97 passed; 14 failed; none skipped. This is diagnostic evidence, not acceptance.

Failures: collapsed Explorer member selectors (3), obsolete navigation/count selectors (3), worker delay interception bypassed by service-worker cache (5), suppressed persistence warning (1), reversed GPU depth (1), capacity timeout during kernel probe (1). Capacity remains under investigation; an isolated Node/WASM probe took about 78–106ms per query and 1.8s to import the actual 10,000-member fixture.

The browser report and check records retain their original hashes. Fresh validation must run against the repaired source, without relabelling these records. Historical evidence overwritten by old tests was copied under diagnostics before restoration. Full local traces are diagnostic artifacts and are not required to be shipped as application assets.

Full original Playwright traces preserved locally at `/tmp/gusset-preview9-diagnostics/test-results` (not a durable release artifact). Report and screenshots below remain in the repository.
