"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindManyVectorStoreResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindManyVectorStoreArgs_1 = require("./args/FindManyVectorStoreArgs");
const VectorStore_1 = require("../../../models/VectorStore");
const helpers_1 = require("../../../helpers");
let FindManyVectorStoreResolver = class FindManyVectorStoreResolver {
    async vectorStores(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindManyVectorStoreResolver = FindManyVectorStoreResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [VectorStore_1.VectorStore], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyVectorStoreArgs_1.FindManyVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindManyVectorStoreResolver.prototype, "vectorStores", null);
exports.FindManyVectorStoreResolver = FindManyVectorStoreResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => VectorStore_1.VectorStore)
], FindManyVectorStoreResolver);
