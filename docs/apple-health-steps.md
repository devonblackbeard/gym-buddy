# Syncing steps from Apple Health

Apple Health (HealthKit) has no web API, so a website or PWA can't read it directly.
Instead, an iOS Shortcut on your iPhone reads the step count and POSTs it to
`/api/steps`. The Workout screen then shows that day's steps and a 7-day bar chart.

## 1. Set a token on Netlify

The step endpoint only accepts writes with a secret token.

1. Make up a long random string (e.g. run `openssl rand -hex 24`).
2. Netlify dashboard → your site → **Site configuration → Environment variables** →
   add `STEPS_TOKEN` with that value (or `netlify env:set STEPS_TOKEN <value>`).
3. Redeploy so the function picks it up.

## 2. Build the Shortcut (iPhone → Shortcuts app → +)

Add these actions in order:

1. **Find Health Samples** where *Type* is *Steps* and *Start Date* is *today*.
   (Leave *Group By* off.)
2. **Calculate Statistics** → *Sum* of *Health Samples*.
3. **Current Date**, then **Format Date** → *Custom* format `yyyy-MM-dd`.
4. **Get Contents of URL**
   - URL: `https://<your-site>.netlify.app/api/steps`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <your STEPS_TOKEN>`
   - Request Body: **JSON**, with two fields:
     - `date` (Text) = *Formatted Date*
     - `steps` (Number) = *Statistics Result*

Run it once by hand: iOS will ask for Health access, allow Steps.
The response is the saved day, e.g. `[{"date":"2026-11-24","steps":7342}]`.

## 3. Run it automatically

Shortcuts → **Automation** → **+** → *Time of Day* (e.g. every hour, or 9 pm daily)
→ *Run Immediately* → pick the shortcut. Add a second automation on
*App → Gym Buddy is opened* if you've added the app to your home screen as a web app,
or just run the shortcut before opening the app.

Each sync sends that day's running total and replaces the stored value, so
running it many times a day is fine.

## Backfilling past days

`POST /api/steps` also accepts an array of up to 400 days:

```json
[{ "date": "2026-11-22", "steps": 10432 }, { "date": "2026-11-23", "steps": 8120 }]
```

## Testing with curl

```sh
curl -X POST https://<your-site>.netlify.app/api/steps \
  -H "Authorization: Bearer $STEPS_TOKEN" -H "content-type: application/json" \
  -d '{"date":"2026-11-24","steps":7342}'
```
