"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteOneVectorStoreResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteOneVectorStoreArgs_1 = require("./args/DeleteOneVectorStoreArgs");
const VectorStore_1 = require("../../../models/VectorStore");
const helpers_1 = require("../../../helpers");
let DeleteOneVectorStoreResolver = class DeleteOneVectorStoreResolver {
    async deleteOneVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteOneVectorStoreResolver = DeleteOneVectorStoreResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => VectorStore_1.VectorStore, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneVectorStoreArgs_1.DeleteOneVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DeleteOneVectorStoreResolver.prototype, "deleteOneVectorStore", null);
exports.DeleteOneVectorStoreResolver = DeleteOneVectorStoreResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => VectorStore_1.VectorStore)
], DeleteOneVectorStoreResolver);
