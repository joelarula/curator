"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyVectorStoreResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const DeleteManyVectorStoreArgs_1 = require("./args/DeleteManyVectorStoreArgs");
const VectorStore_1 = require("../../../models/VectorStore");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const helpers_1 = require("../../../helpers");
let DeleteManyVectorStoreResolver = class DeleteManyVectorStoreResolver {
    async deleteManyVectorStore(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.DeleteManyVectorStoreResolver = DeleteManyVectorStoreResolver;
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyVectorStoreArgs_1.DeleteManyVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], DeleteManyVectorStoreResolver.prototype, "deleteManyVectorStore", null);
exports.DeleteManyVectorStoreResolver = DeleteManyVectorStoreResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => VectorStore_1.VectorStore)
], DeleteManyVectorStoreResolver);
