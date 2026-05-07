/*
 * Public API Surface of framework
 *
 * Two kinds of exports live here:
 *
 *   1. CONTRACTS — interfaces + injection tokens. These are the only things
 *      plugins should depend on. They define WHAT a service does without
 *      committing to HOW.
 *
 *   2. IMPLEMENTATIONS — concrete classes that satisfy the contracts. These
 *      are wired by host applications (e.g. `app`) but should NEVER be
 *      imported by plugin code.
 */

// Contracts
export * from './lib/stores/dashboard-state.store.contract';
export * from './lib/services/dashboard-widget.service.contract';

// Implementations
export * from './lib/stores/dashboard-state.store';
export * from './lib/services/dashboard-widget.service';
