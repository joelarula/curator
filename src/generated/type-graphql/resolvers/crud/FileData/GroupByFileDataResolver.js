"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByFileDataResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GroupByFileDataArgs_1 = require("./args/GroupByFileDataArgs");
const FileData_1 = require("../../../models/FileData");
const FileDataGroupBy_1 = require("../../outputs/FileDataGroupBy");
const helpers_1 = require("../../../helpers");
let GroupByFileDataResolver = class GroupByFileDataResolver {
    async groupByFileData(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
};
exports.GroupByFileDataResolver = GroupByFileDataResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [FileDataGroupBy_1.FileDataGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByFileDataArgs_1.GroupByFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], GroupByFileDataResolver.prototype, "groupByFileData", null);
exports.GroupByFileDataResolver = GroupByFileDataResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], GroupByFileDataResolver);
