# Sohail implementation plan

Based on TrojanQuest Team Build Plan, November 14, 2026.

1. Scaffold React/Vite and Express/TypeScript, root scripts and env example, with no hosting provider requirement.
2. Test then implement multipart photo reporting: authenticated identity, bounded image uploads, vision verdict validation, eight sticker keys, 100 m/two-hour duplicate merge, three reports/hour and memory-only photos.
3. Test then implement quest ordering restricted to Cal's quests and guide answers restricted to Cal's saved USC sources, with validated citations.
4. Document Kartik's helper interface and router mounting. Fail clearly when credentials, data helpers or content are absent; never substitute fake production data.
5. Run tests, TypeScript checks and production build. GitHub invites require teammates' handles.

Scope: Sohail's server entry, server/src/ai, root configuration and initial generated client scaffold. Do not implement teammates' screens, SQL or content. Initial AI-owned contract types will be replaced with Kartik's shared types once supplied.
