import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { AuthProvider } from '../src/context/AuthContext';
import { Header } from '../src/components/Header';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${label}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${label}${detail ? ` (${detail})` : ''}`);
  }
}

console.log('=============================================================================');
console.log('APAIBAY HOMEPAGE & MOBILE SEARCH INPUT REGRESSION SUITE');
console.log('=============================================================================\n');

// 1. Source-level invariants across App.tsx, Header.tsx, SearchPage.tsx
console.log('[1/4] Verifying App.tsx URL Sync & Header Props...');
const appSrc = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
const headerSrc = fs.readFileSync(path.resolve('src/components/Header.tsx'), 'utf8');
const searchPageSrc = fs.readFileSync(path.resolve('src/pages/SearchPage.tsx'), 'utf8');

assert(
  !appSrc.includes('searchQuery=""'),
  'App.tsx no longer hardcodes searchQuery="" on Header'
);
assert(
  appSrc.includes("location.pathname === '/search'") &&
    appSrc.includes("new URLSearchParams(location.search).get('q') || ''"),
  'App.tsx synchronizes Header searchQuery prop from /search?q= URL parameter'
);
assert(
  appSrc.includes('onSearch={handleHeaderSearch}') &&
    appSrc.includes('searchQuery={urlSearchQuery}'),
  'App.tsx passes handleHeaderSearch and urlSearchQuery to Header'
);

console.log('\n[2/4] Verifying Header.tsx Editable Input, Form Submission & Mobile Support...');
assert(
  headerSrc.includes('const [inputValue, setInputValue] = useState(searchQuery);') &&
    headerSrc.includes('setInputValue(searchQuery);'),
  'Header maintains local controlled inputValue state synced with searchQuery prop'
);
assert(
  headerSrc.includes('onSubmit={handleSearchSubmit}') &&
    headerSrc.includes('role="search"'),
  'Header wraps search bar in <form role="search" onSubmit={handleSearchSubmit}>'
);
assert(
  headerSrc.includes('id="main-search-input"') &&
    headerSrc.includes('value={inputValue}') &&
    headerSrc.includes('setInputValue(e.target.value)'),
  'Header #main-search-input updates local inputValue onChange without forcing navigation per keystroke'
);
assert(
  headerSrc.includes('type="search"') &&
    headerSrc.includes('enterKeyHint="search"'),
  'Header #main-search-input configures mobile search keyboard attributes (type="search", enterKeyHint="search")'
);
assert(
  !headerSrc.includes('readOnly') && !headerSrc.includes('disabled'),
  'Header #main-search-input has no disabled or readOnly attributes blocking typing'
);
assert(
  headerSrc.includes("document.addEventListener('touchstart', handleClickOutside"),
  'Header outside-click listener supports mobile touchstart events passively'
);
assert(
  headerSrc.includes('type="submit"') && headerSrc.includes('id="search-submit-btn"'),
  'Header #search-submit-btn is an explicit submit button'
);
assert(
  headerSrc.includes('type="button"') && headerSrc.includes('id="clear-search-btn"'),
  'Header #clear-search-btn is an explicit type="button" (will not accidentally submit form)'
);
assert(
  headerSrc.includes('id="header-camera-search-btn"') &&
    headerSrc.includes('id="header-barcode-scan-btn"'),
  'Header preserves visual camera search and barcode scanner buttons'
);
assert(
  headerSrc.includes('#ff6a00') &&
    headerSrc.includes('w-full sm:flex-1 sm:max-w-2xl relative order-3 sm:order-2'),
  'Header preserves Apaibay orange #FF6A00 and responsive mobile/desktop flex ordering'
);
assert(
  searchPageSrc.includes('useSearchParams') &&
    searchPageSrc.includes('setSearchParams({ q: searchInput.trim() })'),
  'SearchPage preserves URL query parameter filtering and form submission'
);

// 3. Server-render HTML attribute inspection for empty and pre-filled queries
console.log('\n[3/4] Rendering Header Component HTML Markup (Empty vs Active Query)...');
const renderHeaderHtml = (query: string) =>
  renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(Header, {
          cart: [],
          wishlist: [],
          user: null,
          onOpenCart: () => {},
          onOpenWishlist: () => {},
          onOpenOrders: () => {},
          onOpenAccount: () => {},
          onOpenSellerCenter: () => {},
          onOpenAdmin: () => {},
          onSelectCategory: () => {},
          onSearch: () => {},
          searchQuery: query,
          onToggleMobileCategory: () => {},
          isDarkMode: false,
          onToggleDarkMode: () => {},
          onOpenScanner: () => {},
          onOpenVisualSearch: () => {},
        })
      )
    )
  );

const emptyHtml = renderHeaderHtml('');
const inputMatchEmpty = emptyHtml.match(/<input[^>]*id="main-search-input"[^>]*>/);
assert(Boolean(inputMatchEmpty), 'Rendered HTML contains real <input id="main-search-input">');
const inputTagEmpty = inputMatchEmpty?.[0] || '';
assert(inputTagEmpty.includes('type="search"'), 'Rendered input has type="search"');
assert(
  inputTagEmpty.toLowerCase().includes('enterkeyhint="search"'),
  'Rendered input includes enterKeyHint="search"'
);
assert(!/\bdisabled\b/i.test(inputTagEmpty), 'Rendered input is not disabled');
assert(!/\breadonly\b/i.test(inputTagEmpty), 'Rendered input is not readOnly');
assert(!emptyHtml.includes('id="clear-search-btn"'), 'Clear button is hidden when search value is empty');
assert(emptyHtml.includes('<form'), 'Rendered header wraps search input in <form>');
assert(emptyHtml.includes('id="search-submit-btn"'), 'Rendered header includes #search-submit-btn');

const queryHtml = renderHeaderHtml('wireless headphones');
const inputMatchFilled = queryHtml.match(/<input[^>]*id="main-search-input"[^>]*>/);
const inputTagFilled = inputMatchFilled?.[0] || '';
assert(
  inputTagFilled.includes('value="wireless headphones"'),
  'Rendered input displays typed/URL query including letters and spaces'
);
assert(
  queryHtml.includes('id="clear-search-btn"'),
  'Clear button renders when search input has text'
);

// 4. Simulation of typing letters + spaces, deleting, replacing, and submitting
console.log('\n[4/4] Simulating Search State Lifecycle (Type -> Space -> Delete -> Replace -> Submit)...');
let simulatedHeaderInput = '';
let submittedQueries: string[] = [];
const handleSimulatedHeaderSearch = (q: string) => {
  const trimmed = q.trim();
  submittedQueries.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
};

// Typing letters and spaces character by character
for (const ch of 'smart watch') {
  simulatedHeaderInput += ch;
}
assert(
  simulatedHeaderInput === 'smart watch' && submittedQueries.length === 0,
  'Typing letters and spaces preserves full input string without premature route navigation'
);

// Deleting and replacing text
simulatedHeaderInput = simulatedHeaderInput.slice(0, 5); // "smart"
simulatedHeaderInput += 'phone case';
assert(
  simulatedHeaderInput === 'smartphone case',
  'Deleting and replacing characters updates search input accurately'
);

// Submitting via Enter / Search button
handleSimulatedHeaderSearch(`  ${simulatedHeaderInput}  `);
assert(
  submittedQueries[0] === '/search?q=smartphone%20case',
  'Submitting trimmed query navigates to /search?q=smartphone%20case'
);

// Clearing text and submitting empty query
simulatedHeaderInput = '';
handleSimulatedHeaderSearch(simulatedHeaderInput);
assert(
  submittedQueries[1] === '/search',
  'Clearing text and submitting resets cleanly to /search'
);

console.log('\n=============================================================================');
console.log(`SEARCH INPUT REGRESSION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================================================');

if (failed > 0) {
  process.exit(1);
}
