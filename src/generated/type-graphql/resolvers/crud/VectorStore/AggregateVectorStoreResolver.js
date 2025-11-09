"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregateVectorStoreResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateVectorStoreArgs_1 = require("./args/AggregateVectorStoreArgs");
const VectorStore_1 = require("../../../models/VectorStore");
const AggregateVectorStore_1 = require("../../outputs/AggregateVectorStore");
const helpers_1 = require("../../../helpers");
let AggregateVectorStoreResolver = class AggregateVectorStoreResolver {
    async aggregateVectorStore(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).vectorStore.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
};
exports.AggregateVectorStoreResolver = AggregateVectorStoreResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateVectorStore_1.AggregateVectorStore, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateVectorStoreArgs_1.AggregateVectorStoreArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], AggregateVectorStoreResolver.prototype, "aggregateVectorStore", null);
exports.AggregateVectorStoreResolver = AggregateVectorStoreResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => VectorStore_1.VectorStore)
], AggregateVectorStoreResolver);
