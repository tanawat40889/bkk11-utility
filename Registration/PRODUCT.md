# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Staff at district (เขต) level or above of BKK11, checking members in at events on their phone, standing on-site. Hurried, one-handed, often in uneven light, with a queue of people waiting. Thai-language.

## Product Purpose
Attendance check-in: staff create an event, search a member by 8-digit code or name, and mark them present. Staff see only their own region (ภาค). Success = a check-in takes seconds and a mistaken tap is easy to undo.

## Capabilities and Constraints
- Routes: /login (member code only; Supabase Edge Function checkin-login in project bkk11-tokan; position เขต or higher per tokan.position_name), /events, /events/[id].
- Next.js app router + Supabase; all pages are client components using inline-style-free CSS in app/globals.css.
- Data: shared Supabase project bkk11-tokan. Members = table tokan (mt_co = member code, phak_name = ภาค, khet_name = เขต, position_name = position). Own tables checkin_events/checkin_records, accessed only via checkin_* RPCs.

## Brand Commitments
Name: BKK11 (รวมภาคกรุงเทพ). Logo supplied: public/logo.png (3D bold blue wordmark with an orange tagline bar). Brand colours from it: blue #0046c3 (primary), orange #ff833f (accent). Tokens live in app/globals.css. Warm, friendly tone (user's choice), not stiff or bureaucratic.

## Evidence on Hand
Logo only (public/logo.png). No photography. Do not fabricate other brand assets.

## Product Principles
- Speed on the floor beats decoration: one obvious action per row.
- A check-in must confirm visibly and be reversible.
- Warm and approachable, never childish.

## Accessibility & Inclusion
Thai script needs generous line-height; large touch targets (min 44px); text must stay readable in bright light (strong contrast).
