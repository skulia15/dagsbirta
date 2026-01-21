#!/bin/bash
# True Ralph Wiggum - Story-based iterative development
# Based on https://github.com/snarktank/ralph

set -e

MAX_ITERATIONS="${1:-50}"
ITERATION=0
PRD_FILE="prd.json"
PROGRESS_FILE="progress.txt"
LOG_FILE="ralph-$(date +%s).log"

echo "🔄 Starting True Ralph Wiggum"
echo "📋 PRD: $PRD_FILE"
echo "📝 Progress: $PROGRESS_FILE"
echo "🔢 Max iterations: $MAX_ITERATIONS"
echo "─────────────────────────────────────"

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))

    # Find next incomplete story
    NEXT_STORY=$(node -e "
        const prd = require('./$PRD_FILE');
        const story = prd.stories.find(s => !s.passes);
        if (story) {
            console.log(JSON.stringify(story));
        }
    ")

    if [ -z "$NEXT_STORY" ]; then
        echo ""
        echo "✅ ALL STORIES COMPLETE!"
        exit 0
    fi

    STORY_ID=$(echo "$NEXT_STORY" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).id)")
    STORY_TITLE=$(echo "$NEXT_STORY" | node -e "console.log(JSON.parse(require('fs').readFileSync(0, 'utf-8')).title)")

    echo ""
    echo "═══════════════════════════════════════"
    echo "🔄 ITERATION $ITERATION / $MAX_ITERATIONS"
    echo "📖 Story: $STORY_ID - $STORY_TITLE"
    echo "═══════════════════════════════════════"

    # Create prompt for this story
    PROMPT_FILE=$(mktemp)
    cat > "$PROMPT_FILE" << EOF
You are working on ONE story in a Ralph Wiggum loop.

CURRENT STORY:
$NEXT_STORY

PROJECT CONTEXT:
- Read $PRD_FILE to see all stories and what's complete
- Read progress.txt to learn from previous iterations
- Check git log to see what code exists

YOUR TASK:
1. git status - see current state
2. Read relevant files
3. Implement THIS story only (not future stories!)
4. Test your implementation
5. If tests pass: mark story complete and commit
6. If tests fail: document issue in progress.txt for next iteration

MARKING COMPLETE:
When THIS story's acceptance criteria are met:
1. Update $PRD_FILE: set "passes": true for story $STORY_ID
2. Run: npm run build (must succeed)
3. Git commit: 'feat: $STORY_ID - $STORY_TITLE'
4. Append learnings to progress.txt
5. Output: <promise>STORY_COMPLETE</promise>

IMPORTANT:
- Work on ONE story only
- Don't try to complete future stories
- Failures are OK - document and continue next iteration
- Quality over speed - tests must pass

<promise>STORY_COMPLETE</promise> when done
EOF

    # Run Claude
    OUTPUT=$(claude --dangerously-skip-permissions -p "$(cat $PROMPT_FILE)" 2>&1) || true
    rm "$PROMPT_FILE"

    echo "$OUTPUT" | tee -a "$LOG_FILE"

    # Check if story completed
    if echo "$OUTPUT" | grep -q "<promise>STORY_COMPLETE</promise>"; then
        echo ""
        echo "✅ Story $STORY_ID completed!"

        # Verify story was actually marked complete in prd.json
        STORY_PASSES=$(node -e "
            const prd = require('./$PRD_FILE');
            const story = prd.stories.find(s => s.id === '$STORY_ID');
            console.log(story ? story.passes : false);
        ")

        if [ "$STORY_PASSES" = "true" ]; then
            echo "   Story verified in prd.json ✓"
        else
            echo "   ⚠️  Story not marked complete in prd.json - will retry"
        fi
    fi

    if echo "$OUTPUT" | grep -q "<promise>BLOCKED</promise>"; then
        echo ""
        echo "🚫 Story blocked - needs human intervention"
        echo "📝 Full log available at: $LOG_FILE"
        exit 1
    fi

    sleep 2
done

echo ""
echo "⚠️  Max iterations ($MAX_ITERATIONS) reached"
echo "📝 Full log available at: $LOG_FILE"
exit 2
