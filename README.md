# Home Master

A comprehensive mobile-first Angular application designed to be your smart home command center. Control and monitor all aspects of your household environment in one convenient interface.

## Overview

Home Master puts the power of home automation in your hands. From climate control to entertainment, lighting to surveillance, this application provides a unified platform to manage your entire smart home ecosystem.

## Status

🚧 **Project in Progress** - Core infrastructure is set up, features coming soon.

## Project Structure

```
home-master/
├── src/
│   ├── app/                    # Main application
│   │   ├── pages/              # Page components
│   │   │   ├── home/           # Home page with navigation
│   │   │   └── webcam-snip/    # Webcam snapshot utility (WIP)
│   │   ├── app.html
│   │   ├── app.routes.ts       # Routing configuration
│   │   └── app.ts
│   ├── packages/
│   │   └── ui/                 # Custom UI component library (@home-master/ui)
│   │       ├── components/
│   │       │   └── h-button/   # Custom button component
│   │       ├── index.ts        # Package exports
│   │       └── package.json
│   └── styles.scss             # Global styles (dark theme)
└── tsconfig.json               # TS config with @home-master/ui path alias
```

## Features

### Planned Features

#### 🌡️ Climate Control
- Monitor and adjust bathtub water temperature in real-time
- Automated temperature alerts and notifications
- Thermal comfort settings and presets

#### 💡 Lighting Management
- Control lights throughout your home with simple toggles
- Scene presets for different moods and activities
- Automated scheduling and brightness control

#### 📹 Surveillance & Media
- Manage surveillance cameras across your property
- View live feeds and recorded snapshots
- Webcam snapshot utility for quick captures

#### 🚂 Hobby Automation
- Control H0 gauge model train layouts
- Train scheduling and automation sequences
- Real-time monitoring of track systems

#### 🌿 Plant Care Monitoring
- Track humidity levels across multiple plant locations
- Real-time sensor data from house plant monitors
- Care reminders and watering notifications
- Historical data and trends

### Current Implementation
- ✅ Mobile-first dark theme
- ✅ Custom UI component library (`@home-master/ui`)
- ✅ Home page with navigation
- ✅ Routing setup for feature pages
- ✅ h-button custom component with styling

### In Development
- 🚧 Webcam Snip utility - Capture and save snapshots
- 🚧 Feature module architecture and component expansion

## Custom UI Components

Import components from the `@home-master/ui` package:

```typescript
import { HButtonComponent } from '@home-master/ui';

// Use in template:
// <h-button routerLink="/path">Label</h-button>
```

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

Navigate to `http://localhost:4200/`

### Build
```bash
ng build
```

## Styling

- **Global styles**: `src/styles.scss` - Dark theme background
- **Component styles**: Encapsulated SCSS files per component
- **UI Package styles**: Centralized in `@home-master/ui` components

## Architecture Notes

The `@home-master/ui` package is structured as an internal library within the project. All custom UI components are defined here and exported through a barrel export (`index.ts`). This allows for:
- Centralized component management
- Consistent styling across the app
- Easy reusability
- Clear separation of concerns

---

Built with ❤️ using Angular
