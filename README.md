This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Fetching APL Data

Use the provided CLI to fetch SimulationCraft APL files and their declared upstream versions. The script downloads each provided raw GitHub URL, inspects the first line for a pattern like:

```
## Upstream: https://github.com/simulationcraft/simc/blob/thewarwithin/ActionPriorityLists/default/demonhunter_havoc.simc
```

It then downloads that upstream file, and writes a combined JSON file to `public/apl-data.json` which can be consumed by the Next.js app.

Run it with the default Havoc Demon Hunter APL:

```bash
npm run fetch-apls
```

Or pass additional raw URLs:

```bash
node scripts/fetch-apls.js https://raw.githubusercontent.com/Hekili/hekili/thewarwithin/TheWarWithin/Priorities/DemonHunterHavoc.simc https://raw.githubusercontent.com/Hekili/hekili/thewarwithin/Another/File.simc
```

Output file structure example:

```json
{
	"generatedAt": "2025-08-29T12:34:56.000Z",
	"items": [
		{
			"sourceUrl": "https://raw.githubusercontent.com/Hekili/hekili/.../DemonHunterHavoc.simc",
			"upstreamUrl": "https://raw.githubusercontent.com/simulationcraft/simc/.../demonhunter_havoc.simc",
			"firstLine": "## Upstream: https://github.com/simulationcraft/simc/blob/.../demonhunter_havoc.simc",
			"sourceContent": "...",
			"upstreamContent": "..."
		}
	]
}
```

If an upstream cannot be fetched, an `error` field will be present for that item.

## UI

The home page loads `public/apl-data.json` on the server and renders the first entry side-by-side: left = upstream SimulationCraft APL, right = Hekili APL. Run `npm run fetch-apls` to refresh.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
