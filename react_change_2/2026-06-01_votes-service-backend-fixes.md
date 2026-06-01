# Backend — votes.service hardening

**Date:** 2026-06-01  
**Repo:** CTrend (NestJS)  
**Files:** `src/votes/votes.service.ts`, `src/votes/votes.module.ts`

---

## Changes

1. **`forwardRef(() => NotificationsModule)`** — avoids circular DI after vote notifications.
2. **`@Inject(forwardRef(() => NotificationsService))`** in constructor.
3. **Non-blocking notify** — `void this.notifyPostAuthorOfVote(...)` on new vote only.
4. **Logger** on notification failures (replaces empty `catch`).
5. **Mongoose `.exec()`** on `findById` / `findOne`.
6. **Invalid postId** → `BadRequestException` before query.
7. **`post.createdBy.toHexString()`** for consistent string compare with `userId`.

---

## Deploy

```bash
cd CTrend && npm run build && npm run start:dev
```

Restart required after pulling notification + vote changes.
