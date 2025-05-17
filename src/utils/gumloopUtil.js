const fetch = require("node-fetch");

// First, let's create a function to get the run details
async function getFlowRunDetails({
  authToken,
  runId,
  userId,
  projectId = null,
}) {
  const params = new URLSearchParams({
    run_id: runId,
    ...(userId && { user_id: userId }),
    ...(projectId && { project_id: projectId }),
  });

  const response = await fetch(
    `https://api.gumloop.com/api/v1/get_pl_run?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Now let's create a polling function that monitors the flow until completion
async function pollFlowRunUntilComplete({
  authToken,
  runId,
  userId,
  projectId = null,
  pollingIntervalMs = 2000, // Poll every 2 seconds by default
  timeoutMs = 300000, // 5 minute timeout by default
}) {
  const startTime = Date.now();

  while (true) {
    const runDetails = await getFlowRunDetails({
      authToken,
      runId,
      userId,
      projectId,
    });

    // Check if the flow has completed (successfully or not)
    if (runDetails.state === "DONE") {
      return runDetails;
    }

    // Check for failure states
    if (["FAILED", "TERMINATED"].includes(runDetails.state)) {
      throw new Error(`Flow failed with state: ${runDetails.state}`);
    }

    // Check for timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Polling timeout exceeded");
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollingIntervalMs));
  }
}

// Add this function before startAndWaitForFlow
async function startGumloopFlow({
  authToken,
  userId,
  savedItemId,
  projectId = null,
  pipelineInputs = [],
}) {
  const response = await fetch(
    "https://api.gumloop.com/api/v1/start_pipeline",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        user_id: userId,
        saved_item_id: savedItemId,
        project_id: projectId,
        pipeline_inputs: pipelineInputs,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

// Combining both the start flow and polling into one convenient function
async function startAndWaitForFlow({
  authToken,
  userId,
  savedItemId,
  projectId = null,
  pipelineInputs = [],
  pollingIntervalMs = 2000,
  timeoutMs = 300000,
}) {
  try {
    // Start the flow
    const flowStart = await startGumloopFlow({
      authToken,
      userId,
      savedItemId,
      projectId,
      pipelineInputs,
    });

    console.log("Flow started, run ID:", flowStart.run_id);

    // Poll until completion
    const finalResult = await pollFlowRunUntilComplete({
      authToken,
      runId: flowStart.run_id,
      userId,
      projectId,
      pollingIntervalMs,
      timeoutMs,
    });

    return {
      startDetails: flowStart,
      finalResult,
    };
  } catch (error) {
    console.error("Error in flow execution:", error);
    throw error;
  }
}

// Example usage
// const flowConfig = {
//   authToken: process.env.GUMLOOP_API_KEY,
//   userId: process.env.GUMLOOP_USER_ID,
//   savedItemId: process.env.GUMLOOP_SAVED_ITEM_ID,
//   pipelineInputs: [
//     {
//       input_name: "input",
//       value:
//         "I want the MCP server to be able to search for a song, play a song and add a song to a playlist, all on Spotify.",
//     },
//   ],
//   pollingIntervalMs: 2000, // optional: poll every 2 seconds
//   timeoutMs: 300000, // optional: 5 minute timeout
// };

// try {
//   const result = await startAndWaitForFlow(flowConfig);
//   console.log("Flow completed successfully!");
//   console.log("Start details:", result.startDetails);
//   console.log("Final result:", result.finalResult);
//   console.log("Outputs:", result.finalResult.outputs);
// } catch (error) {
//   console.error("Flow execution failed:", error);
// }

module.exports = {
  startAndWaitForFlow,
  getFlowRunDetails,
  pollFlowRunUntilComplete,
  startGumloopFlow,
};
