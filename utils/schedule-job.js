/**
 * Schedules a BullMQ job to run at a specific future time.
 *
 * @param {import('bullmq').Queue} queue - BullMQ queue instance to add the job to
 * @param {string} name - name of the job
 * @param {object} data - job data to pass to the worker
 * @param {Date} runAt - exact time when the job should be executed
 * @param {import('bullmq').JobsOptions} [options={}] - additional job options (e.g., jobId, attempts, etc.)
 * @returns {Promise<import('bullmq').Job>} a scheduled BullMQ job instance.
 */
export default function scheduleJobAt(queue, name, data, runAt, options = {}) {
  const delay = Math.max(runAt.getTime() - Date.now(), 0);
  return queue.add(name, data, { ...options, delay });
}
