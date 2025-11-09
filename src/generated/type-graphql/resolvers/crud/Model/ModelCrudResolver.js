"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCrudResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateModelArgs_1 = require("./args/AggregateModelArgs");
const CreateManyAndReturnModelArgs_1 = require("./args/CreateManyAndReturnModelArgs");
const CreateManyModelArgs_1 = require("./args/CreateManyModelArgs");
const CreateOneModelArgs_1 = require("./args/CreateOneModelArgs");
const DeleteManyModelArgs_1 = require("./args/DeleteManyModelArgs");
const DeleteOneModelArgs_1 = require("./args/DeleteOneModelArgs");
const FindFirstModelArgs_1 = require("./args/FindFirstModelArgs");
const FindFirstModelOrThrowArgs_1 = require("./args/FindFirstModelOrThrowArgs");
const FindManyModelArgs_1 = require("./args/FindManyModelArgs");
const FindUniqueModelArgs_1 = require("./args/FindUniqueModelArgs");
const FindUniqueModelOrThrowArgs_1 = require("./args/FindUniqueModelOrThrowArgs");
const GroupByModelArgs_1 = require("./args/GroupByModelArgs");
const UpdateManyModelArgs_1 = require("./args/UpdateManyModelArgs");
const UpdateOneModelArgs_1 = require("./args/UpdateOneModelArgs");
const UpsertOneModelArgs_1 = require("./args/UpsertOneModelArgs");
const helpers_1 = require("../../../helpers");
const Model_1 = require("../../../models/Model");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const AggregateModel_1 = require("../../outputs/AggregateModel");
const CreateManyAndReturnModel_1 = require("../../outputs/CreateManyAndReturnModel");
const ModelGroupBy_1 = require("../../outputs/ModelGroupBy");
let ModelCrudResolver = class ModelCrudResolver {
    async aggregateModel(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).model.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
    async createManyModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.createMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async createManyAndReturnModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.createManyAndReturn({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async createOneModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.create({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteManyModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteOneModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findFirst({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstModelOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async models(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async model(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async getModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async groupByModel(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
    async updateManyModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.updateMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async updateOneModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async upsertOneModel(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).model.upsert({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.ModelCrudResolver = ModelCrudResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateModel_1.AggregateModel, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateModelArgs_1.AggregateModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "aggregateModel", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyModelArgs_1.CreateManyModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "createManyModel", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => [CreateManyAndReturnModel_1.CreateManyAndReturnModel], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyAndReturnModelArgs_1.CreateManyAndReturnModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "createManyAndReturnModel", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Model_1.Model, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateOneModelArgs_1.CreateOneModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "createOneModel", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyModelArgs_1.DeleteManyModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "deleteManyModel", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneModelArgs_1.DeleteOneModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "deleteOneModel", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstModelArgs_1.FindFirstModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "findFirstModel", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstModelOrThrowArgs_1.FindFirstModelOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "findFirstModelOrThrow", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [Model_1.Model], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyModelArgs_1.FindManyModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "models", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueModelArgs_1.FindUniqueModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "model", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueModelOrThrowArgs_1.FindUniqueModelOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "getModel", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [ModelGroupBy_1.ModelGroupBy], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, GroupByModelArgs_1.GroupByModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "groupByModel", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateManyModelArgs_1.UpdateManyModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "updateManyModel", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Model_1.Model, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneModelArgs_1.UpdateOneModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "updateOneModel", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => Model_1.Model, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpsertOneModelArgs_1.UpsertOneModelArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], ModelCrudResolver.prototype, "upsertOneModel", null);
exports.ModelCrudResolver = ModelCrudResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => Model_1.Model)
], ModelCrudResolver);
