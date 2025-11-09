"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueVectorStoreOrThrowResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FindUniqueVectorStoreOrThrowArgs_1 = require("./args/FindUniqueVectorStoreOrThrowArgs");
const VectorStore_1 = require("../../../models/VectorStore");
const helpers_1 = require("../../../helpers");
let FindUniqueVectorStoreOrThrowResolver = class FindUniqueVectorStoreOrThrowResolver {
    async getVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FindUniqueVectorStoreOrThrowResolver = FindUniqueVectorStoreOrThrowResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueVectorStoreOrThrowArgs_1.FindUniqueVectorStoreOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FindUniqueVectorStoreOrThrowResolver.prototype, "getVectorStore", null);
exports.FindUniqueVectorStoreOrThrowResolver = FindUniqueVectorStoreOrThrowResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => VectorStore_1.VectorStore)
], FindUniqueVectorStoreOrThrowResolver);
