# Astro + React — State Management
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## Tier 1 — Component-Local State

Use `useState` / `useReducer` inside an island. Do not lift unless shared across islands.

## Tier 2 — Cross-Island State (Nano Stores)

Use `nanostores` for any value that two or more islands need to read or write.

```typescript
// src/stores/cart.ts
import { atom, map, computed } from 'nanostores'

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

export const cartItems = map<Record<string, CartItem>>({})

export const cartCount = computed(cartItems, (items) =>
  Object.values(items).reduce((sum, item) => sum + item.quantity, 0)
)

export const cartTotal = computed(cartItems, (items) =>
  Object.values(items).reduce((sum, item) => sum + item.price * item.quantity, 0)
)

export function addItem(item: CartItem) {
  const existing = cartItems.get()[item.id]
  if (existing) {
    cartItems.setKey(item.id, { ...existing, quantity: existing.quantity + 1 })
  } else {
    cartItems.setKey(item.id, item)
  }
}
```

```tsx
// src/components/islands/features/CartIcon.tsx
import { useStore } from '@nanostores/react'
import { cartCount } from '@/stores/cart'

export function CartIcon() {
  const count = useStore(cartCount)
  return <button aria-label={`Cart, ${count} items`}>🛒 {count}</button>
}
```

## Tier 3 — Server/URL State

Use `Astro.url.searchParams` (in `.astro` files) or `URLSearchParams` in islands for filter/sort state that should survive navigation. Prefer URL state over store state for shareable views.

## What NOT to Use

- **Zustand / Redux / Jotai**: Too heavy; Nano Stores are isomorphic, 1KB, and work across any framework Astro supports.
- **React Context for cross-island state**: Context does not cross island boundaries. Islands are separate React roots.
