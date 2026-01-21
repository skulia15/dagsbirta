#!/bin/bash
# Ralph Wiggum Loop - Autonomous AI Development
# Usage: ./ralph-loop.sh "Your task description" [max_iterations]

set -e

TASK="$1"
MAX_ITERATIONS="${2:-20}"
COMPLETION_PROMISE="${3:-COMPLETE}"
ITERATION=0
LOG_FILE="ralph-$(date +%s).log"

if [ -z "$TASK" ]; then
    echo "Usage: ./ralph-loop.sh \"Your task description\" [max_iterations] [completion_promise]"
    echo "Example: ./ralph-loop.sh \"Add room status filter component\" 15 \"COMPLETE\""
    exit 1
fi

echo "🔄 Starting Ralph Wiggum loop"
echo "📋 Task: $TASK"
echo "🔢 Max iterations: $MAX_ITERATIONS"
echo "✅ Completion promise: <promise>$COMPLETION_PROMISE</promise>"
echo "📝 Logging to: $LOG_FILE"
echo "─────────────────────────────────────"

# Enhanced prompt that includes iteration context
RALPH_PROMPT="
You are in a Ralph Wiggum autonomous loop (iteration will be shown below).

ORIGINAL TASK:
$TASK

INSTRUCTIONS:
1. Review your previous work by reading files and checking git status/diff
2. Identify what's been done and what remains
3. Take the NEXT incremental step
4. Run tests/checks to verify your work
5. If tests fail, debug and fix before proceeding
6. When ALL requirements are met, output: <promise>$COMPLETION_PROMISE</promise>
7. If you're blocked and need human help, output: <promise>BLOCKED</promise>

IMPORTANT:
- Make ONE meaningful change per iteration
- Always test your changes
- Read your previous work before making changes
- Self-correct based on test failures
"

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    echo ""
    echo "═══════════════════════════════════════"
    echo "🔄 ITERATION $ITERATION / $MAX_ITERATIONS"
    echo "═══════════════════════════════════════"

    # Create iteration-specific prompt
    ITERATION_PROMPT="$RALPH_PROMPT

CURRENT ITERATION: $ITERATION / $MAX_ITERATIONS
"

    # Create temporary prompt file
    PROMPT_FILE=$(mktemp)
    echo "$ITERATION_PROMPT" > "$PROMPT_FILE"

    # Run Claude with enhanced context
    OUTPUT=$(claude --dangerously-skip-permissions -p "$(cat $PROMPT_FILE)" 2>&1) || true

    # Clean up temp file
    rm "$PROMPT_FILE"

    echo "$OUTPUT" | tee -a "$LOG_FILE"

    # Check for completion signals (using promise format)
    if echo "$OUTPUT" | grep -q "<promise>$COMPLETION_PROMISE</promise>"; then
        echo ""
        echo "✅ Task completed successfully at iteration $ITERATION!"
        echo "📝 Full log available at: $LOG_FILE"
        exit 0
    fi

    if echo "$OUTPUT" | grep -q "<promise>BLOCKED</promise>"; then
        echo ""
        echo "🚫 Task blocked - needs human intervention"
        echo "📝 Full log available at: $LOG_FILE"
        exit 1
    fi

    # Check if Claude is stuck in a loop (same output repeatedly)
    if [ $ITERATION -gt 3 ]; then
        RECENT_HASH=$(tail -100 "$LOG_FILE" | md5)
        PREV_HASH=$(tail -200 "$LOG_FILE" | head -100 | md5)
        if [ "$RECENT_HASH" = "$PREV_HASH" ]; then
            echo "⚠️  Detected potential infinite loop - same output repeated"
            echo "📝 Full log available at: $LOG_FILE"
            exit 3
        fi
    fi

    # Progressive backoff delay
    if [ $ITERATION -lt 5 ]; then
        DELAY=2
    elif [ $ITERATION -lt 10 ]; then
        DELAY=3
    else
        DELAY=5
    fi

    sleep $DELAY
done

echo ""
echo "⚠️  Max iterations ($MAX_ITERATIONS) reached without completion"
echo "📝 Full log available at: $LOG_FILE"
exit 2
