"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueVectorStoreResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindUniqueVectorStoreArgs_1 = require("./args/FindUniqueVectorStoreArgs");
const VectorStore_1 = require("../../../models/VectorStore");
const helpers_1 = require("../../../helpers");
let FindUniqueVectorStoreResolver = class FindUniqueVectorStoreResolver {
    async vectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindUniqueVectorStoreResolver = FindUniqueVectorStoreResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueVectorStoreArgs_1.FindUniqueVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindUniqueVectorStoreResolver.prototype, "vectorStore", null);
exports.FindUniqueVectorStoreResolver = FindUniqueVectorStoreResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => VectorStore_1.VectorStore)
], FindUniqueVectorStoreResolver);
