/** A prepared, named scrape job that can be registered on ScraperService. */
export interface ScraperTask<TInput = any, TOutput = unknown> {
    /** Unique task name, e.g. "youtube-audio". */
    name: string;
    description: string;
    /** Returns true if this task can handle the given URL (used for auto-detection). */
    matches?(url: string): boolean;
    run(input: TInput): Promise<TOutput>;
}
