export interface SeedRbacOptions {
    managers?: string[];
    logger?: {
        info: (msg: string) => void;
        warn?: (msg: string) => void;
        error?: (msg: string) => void;
    };
}
export declare function seedCuratorRbac(prisma: any, options?: SeedRbacOptions): Promise<void>;
//# sourceMappingURL=seeder.d.ts.map