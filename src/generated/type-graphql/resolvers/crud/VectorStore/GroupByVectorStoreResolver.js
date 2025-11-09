"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupByVectorStoreResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const GroupByVectorStoreArgs_1 = require("./args/GroupByVectorStoreArgs");
const VectorStore_1 = require("../../../models/VectorStore");
const VectorStoreGroupBy_1 = require("../../outputs/VectorStoreGroupBy");
const helpers_1 = require("../../../helpers");
let GroupByVectorStoreResolver = class GroupByVectorStoreResolver {
    async groupByVectorStore(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
};
exports.GroupByVectorStoreResolver = GroupByVectorStoreResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [VectorStoreGroupBy_1.VectorStoreGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByVectorStoreArgs_1.GroupByVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], GroupByVectorStoreResolver.prototype, "groupByVectorStore", null);
exports.GroupByVectorStoreResolver = GroupByVectorStoreResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => VectorStore_1.VectorStore)
], GroupByVectorStoreResolver);
