# Home Master

A mobile-first Angular application to control and monitor your smart home from one interface.

## Status

Project in Progress — Core infrastructure is set up; features coming soon.

## Project Structure

```
home-master/
└─ src/
   ├─ app/                      # Main application
   │  ├─ pages/
   │  │  ├─ home/               # Home page with navigation
   │  │  └─ webcam-snip/        # Webcam snapshot utility (WIP)
   │  ├─ app.html
   │  ├─ app.routes.ts          # Routing configuration
   │  └─ app.ts
   ├─ packages/
   │  └─ ui/                    # Custom UI component library (@home-master/ui)
   │     ├─ components/
   │     │  └─ h-button/        # Custom button component
   │     ├─ index.ts            # Package exports
   │     └─ package.json
   └─ styles.scss               # Global styles (dark theme)
tsconfig.json                   # TS config with @home-master/ui path alias
```

## Planned Features

- Climate Control: Temperature monitoring, alerts, presets
- Lighting Management: Toggles, scenes, schedules
- Surveillance & Media: Live feeds, snapshots, webcam utility
- Hobby Automation: Model train control and scheduling
- Plant Care Monitoring: Humidity tracking, reminders, history

## Current Implementation

- Mobile-first dark theme
- Custom UI component library (`@home-master/ui`)
- Home page with navigation
- Routing setup for feature pages
- `h-button` component with loader and result states

## Development

### Prerequisites
- Node.js (v18+)
- Angular CLI

### Setup
```bash
npm install
```

### Run Dev Server
```bash
ng serve
```

Navigate to http://localhost:4200/

### Build
```bash
ng build
```

## Styling

- Global styles: `src/styles.scss`
- Component styles: Encapsulated SCSS files per component
- UI Package styles: Centralized in `@home-master/ui` components

## Architecture Notes

The `@home-master/ui` package is an internal library. Components are exported via a barrel (`index.ts`) for centralized management, consistent styling, and ease of reuse.
