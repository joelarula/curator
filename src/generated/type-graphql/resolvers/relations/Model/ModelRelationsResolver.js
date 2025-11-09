"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRelationsResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const Chunk_1 = require("../../../models/Chunk");
const Model_1 = require("../../../models/Model");
const ModelChunksArgs_1 = require("./args/ModelChunksArgs");
const helpers_1 = require("../../../helpers");
let ModelRelationsResolver = class ModelRelationsResolver {
    async chunks(model, ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findUniqueOrThrow({
            where: {
                id: model.id,
            },
        }).chunks({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.ModelRelationsResolver = ModelRelationsResolver;
tslib_1.__decorate([
    TypeGraphQL.FieldResolver(_type => [Chunk_1.Chunk], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Ctx()),
    tslib_1.__param(2, TypeGraphQL.Info()),
    tslib_1.__param(3, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Model_1.Model, Object, Object, ModelChunksArgs_1.ModelChunksArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelRelationsResolver.prototype, "chunks", null);
exports.ModelRelationsResolver = ModelRelationsResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], ModelRelationsResolver);
