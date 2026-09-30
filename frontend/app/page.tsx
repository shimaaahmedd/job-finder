import { JobsList } from "@/components/jobs/JobsList";
import { ReEvaluateJobsButton } from "@/components/pipeline/ReEvaluateJobsButton";
import { RunPipelineButton } from "@/components/pipeline/RunPipelineButton";

export default function Home() {
    return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
            <main className="flex flex-1 w-full flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
                <JobsList />
                <div className="flex justify-between w-full">
                    <ReEvaluateJobsButton />
                    <RunPipelineButton />
                </div>
            </main>
        </div>
    );
}
