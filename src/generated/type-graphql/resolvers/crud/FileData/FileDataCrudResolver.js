"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCrudResolver = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const AggregateFileDataArgs_1 = require("./args/AggregateFileDataArgs");
const CreateManyAndReturnFileDataArgs_1 = require("./args/CreateManyAndReturnFileDataArgs");
const CreateManyFileDataArgs_1 = require("./args/CreateManyFileDataArgs");
const CreateOneFileDataArgs_1 = require("./args/CreateOneFileDataArgs");
const DeleteManyFileDataArgs_1 = require("./args/DeleteManyFileDataArgs");
const DeleteOneFileDataArgs_1 = require("./args/DeleteOneFileDataArgs");
const FindFirstFileDataArgs_1 = require("./args/FindFirstFileDataArgs");
const FindFirstFileDataOrThrowArgs_1 = require("./args/FindFirstFileDataOrThrowArgs");
const FindManyFileDataArgs_1 = require("./args/FindManyFileDataArgs");
const FindUniqueFileDataArgs_1 = require("./args/FindUniqueFileDataArgs");
const FindUniqueFileDataOrThrowArgs_1 = require("./args/FindUniqueFileDataOrThrowArgs");
const GroupByFileDataArgs_1 = require("./args/GroupByFileDataArgs");
const UpdateManyFileDataArgs_1 = require("./args/UpdateManyFileDataArgs");
const UpdateOneFileDataArgs_1 = require("./args/UpdateOneFileDataArgs");
const UpsertOneFileDataArgs_1 = require("./args/UpsertOneFileDataArgs");
const helpers_1 = require("../../../helpers");
const FileData_1 = require("../../../models/FileData");
const AffectedRowsOutput_1 = require("../../outputs/AffectedRowsOutput");
const AggregateFileData_1 = require("../../outputs/AggregateFileData");
const CreateManyAndReturnFileData_1 = require("../../outputs/CreateManyAndReturnFileData");
const FileDataGroupBy_1 = require("../../outputs/FileDataGroupBy");
let FileDataCrudResolver = class FileDataCrudResolver {
    async aggregateFileData(ctx, info, args) {
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.aggregate({
            ...args,
            ...(0, helpers_1.transformInfoIntoPrismaArgs)(info),
        });
    }
    async createManyFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.createMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async createManyAndReturnFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.createManyAndReturn({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async createOneFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.create({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteManyFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.deleteMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async deleteOneFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.delete({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findFirst({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findFirstFileDataOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findFirstOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findManyFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findUniqueFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findUnique({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async findUniqueFileDataOrThrow(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.findUniqueOrThrow({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async groupByFileData(ctx, info, args) {
        const { _count, _avg, _sum, _min, _max } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.groupBy({
            ...args,
            ...Object.fromEntries(Object.entries({ _count, _avg, _sum, _min, _max }).filter(([_, v]) => v != null)),
        });
    }
    async updateManyFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.updateMany({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async updateOneFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.update({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
    async upsertOneFileData(ctx, info, args) {
        const { _count } = (0, helpers_1.transformInfoIntoPrismaArgs)(info);
        return (0, helpers_1.getPrismaFromContext)(ctx).fileData.upsert({
            ...args,
            ...(_count && (0, helpers_1.transformCountFieldIntoSelectRelationsCount)(_count)),
        });
    }
};
exports.FileDataCrudResolver = FileDataCrudResolver;
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => AggregateFileData_1.AggregateFileData, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, AggregateFileDataArgs_1.AggregateFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "aggregateFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyFileDataArgs_1.CreateManyFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "createManyFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => [CreateManyAndReturnFileData_1.CreateManyAndReturnFileData], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateManyAndReturnFileDataArgs_1.CreateManyAndReturnFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "createManyAndReturnFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => FileData_1.FileData, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, CreateOneFileDataArgs_1.CreateOneFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "createOneFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteManyFileDataArgs_1.DeleteManyFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "deleteManyFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, DeleteOneFileDataArgs_1.DeleteOneFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "deleteOneFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstFileDataArgs_1.FindFirstFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "findFirstFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindFirstFileDataOrThrowArgs_1.FindFirstFileDataOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "findFirstFileDataOrThrow", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => [FileData_1.FileData], {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindManyFileDataArgs_1.FindManyFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "findManyFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueFileDataArgs_1.FindUniqueFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "findUniqueFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Query(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, FindUniqueFileDataOrThrowArgs_1.FindUniqueFileDataOrThrowArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "findUniqueFileDataOrThrow", null);
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
], FileDataCrudResolver.prototype, "groupByFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => AffectedRowsOutput_1.AffectedRowsOutput, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateManyFileDataArgs_1.UpdateManyFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "updateManyFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => FileData_1.FileData, {
        nullable: true
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpdateOneFileDataArgs_1.UpdateOneFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "updateOneFileData", null);
tslib_1.__decorate([
    TypeGraphQL.Mutation(_returns => FileData_1.FileData, {
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Ctx()),
    tslib_1.__param(1, TypeGraphQL.Info()),
    tslib_1.__param(2, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object, Object, UpsertOneFileDataArgs_1.UpsertOneFileDataArgs]),
    tslib_1.__metadata("design:returntype", Promise)
], FileDataCrudResolver.prototype, "upsertOneFileData", null);
exports.FileDataCrudResolver = FileDataCrudResolver = tslib_1.__decorate([
    TypeGraphQL.Resolver(_of => FileData_1.FileData)
], FileDataCrudResolver);
