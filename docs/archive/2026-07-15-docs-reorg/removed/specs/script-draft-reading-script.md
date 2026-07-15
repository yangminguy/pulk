# Feature Specification: ScriptDraft & ReadingScript Card

## 1. Overview
This specification outlines the design and implementation requirements for two key components used in video script authoring and recording workflows:
- **ScriptDraft**: A professional-grade text editor tailored for scriptwriting (handling characters, dialogues, and stage directions).
- **ReadingScript Card**: A teleprompter-style viewer component optimized for smooth scrolling while a creator is recording.

Based on recent open-source research, `ScriptDraft` will be built on top of **Meta's Lexical** framework utilizing the **Fountain.io** markdown standard, while `ReadingScript Card` will be a **Custom React Component** with benchmarked smooth-scrolling algorithms.

## 2. Requirements Specification

### 2.1 ScriptDraft (Editor Component)
- **Framework**: Meta's Lexical framework (`lexical`, `@lexical/react`).
- **Data Standard**: Fountain.io syntax (Markdown-based script format) for input, output, and persistence.
- **Features**:
  - **Block Types**: Support distinct formatting blocks for Scene Heading, Character, Dialogue, Parenthetical, and Action.
  - **Ergonomics**: Keyboard shortcuts typical of screenwriting software (e.g., hitting `Tab` to switch from Action to Character, or `Enter` to go from Character to Dialogue).
  - **Data Handling**: Real-time parsing and serialization to/from Fountain text format.

### 2.2 ReadingScript Card (Teleprompter Component)
- **Framework**: Custom React component leveraging standard web APIs (`requestAnimationFrame`) for scrolling.
- **Features**:
  - **Smooth Auto-scrolling**: Implementation of a jank-free continuous scrolling algorithm.
  - **Playback Controls**: Play, pause, rewind, and variable scroll speed adjustments.
  - **Visual Aids**: Large, high-contrast typography, adjustable font size, and a focus-line indicator highlighting the current sentence or block to read.
  - **Responsiveness**: Support for full-screen mode and various aspect ratios to accommodate different prompter setups.

## 3. Acceptance Criteria (Measurable)
1. **ScriptDraft Parsing**: The editor successfully ingests a standard 10-page Fountain text file and renders the structural blocks correctly within 500ms.
2. **ScriptDraft Formatting Flow**: Typing a character name (all caps) and pressing `Enter` automatically creates a Dialogue block.
3. **ReadingScript Scrolling Performance**: The teleprompter scrolls continuously maintaining a consistent 60fps (or < 16.6ms frame rendering time) without noticeable stuttering over a 3-minute test.
4. **ReadingScript Control responsiveness**: Adjusting the speed multiplier via UI controls reflects immediately on the scroll speed without breaking the scroll loop.
5. **Data Round-trip Validation**: Content written in `ScriptDraft`, saved as a Fountain string, and then passed into `ReadingScript Card` renders exactly the matching structural blocks (Character, Dialogue, etc.).

## 4. Impacted Files & Modules
- **New Components**:
  - `apps/founder-ui/src/components/ScriptDraft/ScriptDraft.tsx`
  - `apps/founder-ui/src/components/ScriptDraft/plugins/FountainPlugin.tsx`
  - `apps/founder-ui/src/components/ReadingScriptCard/ReadingScriptCard.tsx`
  - `apps/founder-ui/src/components/ReadingScriptCard/useSmoothScroll.ts`
- **Core Logic**:
  - `packages/l5-core/src/functions/script-parsing/fountain.ts` (Parsing logic)
- **Modifications**:
  - `apps/founder-ui/package.json` (Addition of `lexical` and `@lexical/react`)
  - `apps/founder-ui/src/app/video-room/page.tsx` (Integration of `ReadingScript Card`)
  - `apps/founder-ui/src/app/chat/page.tsx` (Integration of `ScriptDraft`)
